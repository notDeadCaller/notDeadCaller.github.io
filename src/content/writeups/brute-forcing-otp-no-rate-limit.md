---
art: counter
title: 'One Million Guesses: Brute-Forcing an OTP With No Rate Limit'
description: 'An authorized black-box test on a login flow that issued a one-time password but never limited how many times you could guess it.'
pubDate: 2026-06-27
tags: ['pentest', 'auth', 'rate-limiting']
tldr: "Login sent you a 6-digit code over email, then let you guess it as many times as you wanted. No lockout, no throttle, nothing. 6 digits is a million combos, which sounds like a lot until you realise a script walks the whole thing before the code even expires. So: full account takeover off a tiny missing check. Funniest part, the app sat behind Cloudflare, and people assume that means rate limiting is handled. It is not. The CDN stops floods, it has no idea 50 wrong OTPs on one account is an attack. That check has to live in the app. Rated High."
summary:
  target: 'Meridian Portal (anonymized)'
  engagement: 'Authorized black-box web pentest'
  finding: 'Unlimited OTP attempts, leading to account takeover'
  severity: 'High'
---

A while back I ran an authorized black-box penetration test against a web application. I'll call the target **Meridian Portal** throughout — the findings were disclosed privately and I've stripped anything identifying. One issue stood out for how small the bug was and how large the consequence: the login flow issued a one-time password, then let you guess it as many times as you wanted.

(Black-box means no source code, no credentials, no internal docs — you poke at the application the way an external attacker would.)

## The flow

Meridian used a two-step login. You submit valid-looking credentials, the server emails a six-digit OTP, and you POST that code back to confirm. Standard pattern, and a good one — a stolen password alone shouldn't be enough to get in.

The verification request looked roughly like this:

```http
POST /api/auth/verify-otp HTTP/1.1
Host: portal.example.com
Content-Type: application/json

{"sessionId":"e3b0c442...","otp":"000000"}
```

A wrong code returned `401` with `{"error":"invalid_otp"}`. The correct code returned `200` and a session. Clean and predictable — which is exactly the problem.

## The finding

A six-digit numeric OTP has 10<sup>6</sup> = 1,000,000 possible values. That sounds like a lot until you ask the only question that matters: *how many times can I guess?*

The answer was unlimited. No per-session attempt counter, no per-account lockout, no per-IP throttling, no challenge after repeated failures. The OTP also stayed valid for several minutes and wasn't invalidated after wrong guesses. So the attack is just a loop — point Burp Intruder (or a short script) at the endpoint and walk the keyspace:

```text
000000 → 401
000001 → 401
000002 → 401
   ...
→ 200   (session issued)
```

I confirmed the control was missing *without* taking over a real account: several hundred sequential guesses went through untouched — no throttling, no degradation, no block — which is enough to prove the keyspace is traversable inside the validity window. With modest concurrency a six-digit space is comfortably reachable before the code expires; a four-digit OTP would fall in seconds.

Because this sits in front of authentication and yields full account takeover with no privileges and low attack complexity, it rated **High**.

## Why it existed

This is the part worth dwelling on. The application was fronted by Cloudflare — CDN and WAF both in place. It's tempting to assume that means rate limiting is handled. It isn't.

Edge rate limiting defends against *volumetric* abuse: floods, scraping, crude credential stuffing. It generally doesn't know that fifty `401`s on an OTP endpoint from a single session is an attack, because that's application logic, not a traffic anomaly. The throttling that stops OTP brute force has to live where the OTP is actually checked — in the app, bound to the session and the account. The CDN out front created a false sense of coverage for a gap only the application could close.

## The fix

Remediation is cheap relative to the impact:

- **Cap attempts per OTP** — invalidate the code after 3–5 wrong guesses and force a reissue.
- **Throttle per account *and* per IP/session**, with exponential backoff.
- **Keep the OTP TTL short** (30–60s is plenty) so the guessing window stays small.
- **Add a CAPTCHA or step-up challenge** once a failure threshold is crossed.
- **Log and alert on bursts of failed verifications** — this attack is loud if anyone is watching.

None of these is novel. The takeaway isn't the fix, it's the gap: a strong-looking two-step login was undone by one missing counter, and the infrastructure in front of it hid the hole rather than covering it.

---

*This engagement was authorized. The target name, endpoints, and identifiers above are anonymized or fabricated. Never test systems you don't have written permission to test.*
