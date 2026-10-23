---
art: redact
title: 'One Falsy Zero: A Privacy Redaction Bypass Hiding in indexOf'
description: 'A feature-flag SDK let you mark an attribute private, then shipped it anyway if its name started with a “/” or “~”. The whole bug was one function using indexOf as a boolean and tripping over a legitimate zero.'
pubDate: 2026-09-23
tags: ['bug-bounty', 'privacy', 'oss', 'input-parsing']
tldr: "A popular feature-flag SDK lets you tag user attributes as private so they never leave your servers. Turns out if the attribute's name started with a / or a ~, the SDK ignored the private tag and sent the value anyway, no error, nothing in the \"we redacted this\" list. Looks fine in your code, leaks in production. Root cause is one line: someone wrote `if (ref.indexOf('~'))` to mean \"does it contain a ~\", but indexOf returns 0 when the ~ is the very first character, and 0 is falsy, so the un-escaping got skipped and the name never matched the private list. One zero. Fix is `includes()` instead of `indexOf()`. Got accepted as valid, marked a dupe. Self-rated P4."
summary:
  target: 'JavaScript feature-flag SDK (anonymized)'
  platform: 'Bugcrowd — managed engagement'
  category: 'Open-source SDK'
  finding: 'Private-attribute redaction bypass, PII transmitted and stored'
  severity: 'P4 (self-assessed) · accepted, duplicate'
---

Here is a bug I really like, because the fix is one word and the cause is a single character of input landing in exactly the wrong spot. A widely used JavaScript feature-flag SDK gives you a documented way to mark a user attribute as private, meaning the SDK must never send its value off your servers. It redacts those values before any event leaves. Except for one shape of attribute name, where it quietly sent the value anyway, with no error and no sign anything had leaked.

I'll keep the vendor and package anonymous for reasons at the bottom. The mechanism is the interesting part and it survives the anonymizing just fine.

## What you ask for vs. what you get

You configure a context (the SDK's word for a user) and list which attributes are private using the documented syntax. For a top-level attribute literally named `/id`, that syntax is the escaped JSON-Pointer form `"/~1id"`. You send one identify call. You expect `/id` to stay on your servers.

What actually happened: the value was transmitted to the SDK's event endpoint and stored, visible in the vendor's own dashboard. The attribute did not appear in the event's `redactedAttributes` list either, so nothing even told you it had been exposed. A control attribute (`email`, marked private the normal way) redacted correctly in the same event, which proves the private mechanism works in general and this is a real bypass, not me misconfiguring it.

```text
leaked:   /id   = "CANARY-PII-SLASH-DO-NOT-STORE"   (present in the outgoing event)
redacted: email                                     (correctly absent)
```

## The one line

Attribute references use JSON-Pointer escaping (RFC 6901): `~1` means `/` and `~0` means `~`, because those two characters are special in a pointer. So an attribute named `/id` is written `/~1id`, and the parser is supposed to reverse that escaping per path component before it compares the reference against your private list.

Here is the function that reverses it, give or take names:

```js
function unescape(ref) {
  return ref.indexOf('~') ? ref.replace(/~1/g, '/').replace(/~0/g, '~') : ref;
}
```

Read `ref.indexOf('~')` as the author intended it: "if this component contains a tilde, unescape it." That is wrong in one specific case. `indexOf` returns the *index* of the match, and when the component *begins* with `~`, that index is `0`. `0` is falsy. So for a component like `~1id`, the condition is false, the unescaping is skipped, and the function returns the string still escaped: `~1id` instead of `/id`.

Now the private list says redact the attribute named `/id`, but the parser produced `~1id`, and `~1id !== /id`, so the exact-match in the redaction filter never fires. The value sails through into the outgoing event untouched.

A component only begins with `~` when the first character of the real property name is `/` or `~` (the only two characters this escaping touches), so that is the exact trigger: any top-level attribute whose name starts with a slash or a tilde, or a nested property with a leading one. Every other name is unaffected, because its escape lands at index 1 or later and `indexOf` is truthy.

The fix is to stop using an index as a boolean:

```js
return ref.includes('~') ? /* unescape */ : ref;
```

One more tell that this is a bug and not an intended quirk: the same file's *serializer* happily produces `/~0y` for an attribute named `~y`, yet this parser cannot read that back. The library emits references it can't itself parse.

## Why it rates more than a shrug

This is not externally attacker-triggered. The attribute name is your configuration, not hostile input, and nobody crosses a trust boundary. So it is not a classic exploit, and I assessed it **P4 with a P3 argument**, not high severity. What it is: a documented privacy control that silently fails, across the whole JavaScript SDK family, with no selective workaround. If you need to keep a `/id` or similar out, the only thing that works is the all-or-nothing "make every attribute private" flag. Every selective, documented form leaks. For anyone relying on that control to meet a data-handling promise, "it silently did the opposite of what the docs said" is the bad part.

There is a chained angle too. The same parser runs in the server-side evaluator, where flag-targeting rules match on attributes. A rule keyed on a `/`- or `~`-leading attribute resolves to `undefined` and can never match. A *grant* rule that never matches fails closed, which is safe. But a *deny* or restrict rule that never matches fails open, which is not. Same root cause, so I filed it as chained impact rather than a separate bug.

## Proving it without hand-waving

The first submission got closed "unable to reproduce," so the resubmission led with two reproductions. One sends a single context through the real SDK and shows the leaked value sitting in the dashboard. The other never touches the network at all: it calls the SDK's own shipped redaction code directly, so the defect is confirmable in about a minute with nothing sent anywhere.

```text
npm i <sdk>@<version>
node leak-check.js
# exit 0 = reproduced/vulnerable, 1 = not

SUMMARY: 3/3 private values LEAKED, 2/2 controls redacted correctly.
VERDICT: VULNERABLE — private-attribute redaction bypassed
```

Running the vendor's own code against their own test data, offline, is the version a triager can't argue with. The two controls redacting correctly in the same run is what turns "reproduced" into "and here's proof it's a bug, not my setup."

## The takeaway

`indexOf` returning `0` for a match at the start of a string is one of the oldest traps in JavaScript, and it almost always hides where a found-at-index-zero is a legitimate result. Searching for a character that the *escaping scheme itself* places at the front of a component is exactly that situation. The lazy, correct habit: when you mean "does it contain," write `includes`. When you mean "where is it," use the index and compare it to `-1` on purpose. The gap between those two is where a privacy control quietly inverted itself.
