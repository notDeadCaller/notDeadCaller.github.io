---
art: oracle
title: 'Two Oracles and No Lock: Enumerating Accounts on an Identity Provider'
description: 'A pre-authentication account-enumeration finding on a third-party cyber-risk vendor’s login system, leaking account existence through both a response-body oracle and a 45x response-timing oracle, with no rate limiting to slow either one.'
pubDate: 2026-06-19
updatedDate: 2026-07-02
tags: ['bug-bounty', 'account-enumeration', 'timing-attack', 'rate-limiting']
tldr: "The login system would straight up tell you if an email had an account, two different ways. One: the JSON response just looked different for real vs fake emails. Two: even the endpoint that returns the same message every time took ~45x longer for real accounts (it was busy sending an email), so you could read the clock instead. And nothing stopped you from asking a million times. Got marked P5 / informational (and a dupe), fair enough, but I like it because they fixed the obvious leak and the same secret still walked out through a timing side channel. Fixing one copy of a leak isn't fixing the leak."
summary:
  target: 'Cyber-risk ratings login system (anonymized)'
  platform: 'Bugcrowd — managed engagement'
  category: 'API testing'
  finding: 'Pre-auth account enumeration via body and timing oracles'
  severity: 'P5 · Informational'
---

Not a glamorous one. It got triaged **P5 / Informational** and marked a duplicate. I'm writing it up anyway, because the shape of it is a good lesson: the same fact leaked through two separate channels, and fixing the obvious one would have left the other wide open. The target was the login system in front of a third-party cyber-risk ratings platform. I'll call it **Argus** and keep everything else stripped out. It was tested under an authorized Bugcrowd engagement.

The whole finding comes down to one old, boring question. Can an unauthenticated stranger ask your login system "does this email have an account here?" and get an honest answer? On Argus the answer was yes, in two different ways, and nothing stopped you from asking a million times.

## Why account existence matters here

On most sites, email enumeration is a shrug. On this one it isn't, and the reason is the business. Accounts on Argus belong to the platform's customers, their vendors, and trial users, not to Argus staff. So "this email has an account" quietly means "this person or company is a customer of a third-party-risk vendor." That is a relationship you can now confirm from the outside. An attacker can:

- confirm whether a target organization is an Argus customer,
- check whether a specific individual holds an account (good bait for a spear-phish), and
- trim a list of guessed addresses down to only the live ones before credential stuffing.

One honest caveat, which I put in the report: Argus offers public self-serve trials, so not every account is an established enterprise customer. That softens the customer-confirmation angle. It does not remove it.

## Channel 1: the response-body oracle

The pre-login endpoint that decides how an address should sign in returned a different JSON body depending on whether the account existed.

```http
GET /users/sso-check?email=<addr>
```

For an existing account, `uri` is populated:

```json
{"data":{"uri":"https://auth.argus.example/users/sign_in","sso_user":false,"requires_password_reset":false}}
```

For an address with no account, `uri` is `null`:

```json
{"data":{"uri":null,"requires_password_reset":false,"sso_user":false}}
```

That is the whole oracle. Presence or absence of `"uri":null`, trivially scriptable, no cleverness needed. To prove it without touching anyone's real account, I used one published role address as a positive control and eight UUID-randomized addresses as guaranteed negatives. The odds of a random UUID address hitting a real mailbox are negligible by construction, so the negatives are safe.

```text
[ EXISTS   ] support@argus.example
[ NOT FOUND ] noaccount-302585f9-…@argus.example
[ NOT FOUND ] noaccount-5d19888c-…@argus.example
… (6 more synthetic addresses, all NOT FOUND)
```

## Channel 2: the response-timing oracle

This is the half I actually enjoyed. The account-unlock endpoint does the responsible thing with its body. It returns the same generic message for every input ("if your account exists, you'll receive an email…"), so there is nothing to read.

```http
POST /users/unlock
```

But the body is not the only thing that leaks. The backend's processing time was about **45x** higher when the account existed. I measured it server-side from the `x-envoy-upstream-service-time` header, so network jitter is out of the picture, across 15 samples each:

| Input | Backend time | Mean (n=15) |
|---|---|---|
| Existing account | 128–209 ms | ≈174 ms |
| Non-existent address | 3–6 ms | ≈4 ms |

The two groups do not overlap. The slowest non-existent sample was still more than 20x faster than the fastest existing one. That makes it a clean, reliable oracle. It is an application-layer timing difference, not a banner leak. I happened to read it from the Envoy header, but it is just as measurable from raw response latency on a low-jitter connection. The existing account takes longer because a real user record means real work, generating and queueing the unlock email, while a miss bails out immediately.

This is also why the body-equalization here is a lesson rather than a win. The team thought about disclosure and returned an identical body, but they equalized the wrong layer. The fix for a timing oracle is to equalize time, not text. And they clearly know how, because the adjacent password-reset flow does it: existing vs. non-existent came back 782 ms vs. 745 ms there, no usable gap.

## The amplifier: no rate limit

Neither oracle scales to a real target list if you can only ask a handful of times. You could ask as many times as you liked. Fifty requests in a row to the enumeration endpoint all returned `200`, no `429`, no slowdown:

```text
start 20:42:32 → end 20:44:10 ; 50/50 → 200
```

The request rate in that test was limited by my own network, not by anything on the server. A rate limit does not fix an oracle, but its absence is what turns a curiosity into a bulk capability. A body oracle you can hit a million times is a customer list.

## Proof of concept

The logic is small. Grab the session cookie the sign-in page hands out, then loop the check endpoint and read both the body oracle and the Envoy timing from the same request.

```bash
test_one() {
  local email="$1" label="$2"
  curl -s -c "$jar" "https://auth.argus.example/users/sign_in" -o /dev/null
  local body http t
  body=$(curl -s -b "$jar" "https://auth.argus.example/users/sso-check?email=$(enc "$email")" -D /tmp/h.txt)
  t=$(grep -i 'x-envoy-upstream-service-time' /tmp/h.txt | grep -oE '[0-9]+')
  # a populated uri (not "uri":null) means the account exists
  if echo "$body" | grep -q '"uri":null'; then
    echo "  [NOT FOUND] $label  (envoy=${t}ms)  $email"
  else
    echo "  [ EXISTS  ] $label  (envoy=${t}ms)  $email"
  fi
}

# one published role address as a positive anchor; synthetic UUID negatives that can't match a real person
known="support@argus.example"
for i in $(seq 1 8); do
  synth+=("noaccount-$(cat /proc/sys/kernel/random/uuid)@argus.example")
done
```

## Remediation

What I recommended, ordered by how directly each one kills a channel:

1. **`/users/sso-check`**: return an identical response regardless of account existence, or move the check behind authentication or a CSRF-bound, rate-limited flow.
2. **`/users/unlock`**: equalize backend processing time across existing and non-existent inputs, the way the password-reset flow already does.
3. **Rate limiting or progressive challenges** on every account-status endpoint, so even a leftover oracle can't be queried at scale.

## The takeaway

Enumeration findings get waved off as informational, and at P5 the triager wasn't wrong. But the structure is worth keeping. One equalized channel is not a fixed vulnerability if a second, unequalized channel reports the same secret. The unlock endpoint had a careful, deliberate body-equalization, and it leaked the identical fact through a clock. When you close an oracle, close every layer that can observe the thing you're hiding, not just the one you were looking at.
