---
title: 'CTF writeup template'
description: 'Copy this file to start a CTF writeup. Drafts only show on the local dev server, never on the live site.'
pubDate: 2026-10-20
draft: true
art: flag
tags: ['ctf', 'web']
ctf:
  event: 'Sudo Override 2026'
  challenge: 'Challenge name'
  category: 'web'
  points: 500
  solves: 12
  difficulty: 'hard'
  result: '1st place'
  flag: 'flag{replace_me}'
---

Start with one sentence on what the bug was and why it mattered. Readers who stop here should still know the punchline.

Every field in the `ctf:` block above is optional except `event` and `category`. The card at the top is built from them, and `flag` stays hidden until the reader clicks to reveal it. Set `art: flag` for the waving flag cover, or any other motif.

## Challenge

What you were given: the prompt, files, a URL, the source if any.

## Recon

What you looked at first and what stood out.

## Exploit

The path from foothold to flag. Use code blocks for requests and scripts:

```python
import requests

r = requests.post('http://chall.example/login', data={'user': 'admin', 'pass': "' OR 1=1 --"})
print(r.text)
```

Long tool output can be folded away so it doesn't break the flow:

<details>
<summary>Full nmap output</summary>

```text
PORT     STATE SERVICE
22/tcp   open  ssh
80/tcp   open  http
8080/tcp open  http-proxy
```

</details>

## Takeaways

What you would check first next time, and what the defender should have done.
