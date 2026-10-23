---
title: 'Keep a UUID generator one keystroke away'
description: 'Synthetic, collision-free test inputs make a finding undeniable: no real account, no real person, just guaranteed negatives.'
pubDate: 2026-08-15
tags: ['pentest', 'workflow']
maturity: seedling
---

Half of proving an account-enumeration or oracle bug is picking inputs a triager cannot argue with. A random UUID baked into an address — `noaccount-<uuid>@target` — is a guaranteed negative by construction, so your "not found" column is trustworthy without touching anyone's real data.

I keep `cat /proc/sys/kernel/random/uuid` bound to a shortcut. Small thing, used constantly.
