---
art: lattice
title: 'AnonComm'
description: 'A private one-to-one chat over raw TCP, written in C, with post-quantum key exchange.'
year: 2025
stack: ['C', 'POSIX threads', 'liboqs', 'CRYSTALS-Kyber', 'CRYSTALS-Dilithium', 'AES-256-GCM', 'ncurses']
repo: 'https://github.com/notDeadCaller/AnonComm'
featured: true
favourite: true
order: 2
log:
  - date: 2025-09-03
    title: 'The first 04:04'
    items: ['One-to-one TCP chat on the command line', 'Password authentication', 'Private-to-public IP tunnelling']
  - date: 2025-09-06
    title: 'They are watching'
    items: ['A small firewall through an IP allowlist', 'Messages can contain spaces', 'Fixed a risky variable-handling bug']
  - date: 2025-09-11
    title: "Uh uh uh! You didn't say the magic word!"
    items: ['A master passkey that bypasses the allowlist', 'Coloured console output and sound pings on new messages']
  - date: 2025-09-27
    title: 'For the unknown listeners of the night'
    items: ['First encryption: Vigenère cipher', 'Diffie-Hellman key exchange between client and server', 'Threaded waiting animation']
  - date: 2025-10-03
    title: 'Keep em coming'
    items: ['Asynchronous chat with separate send and receive threads', 'Client-side round-trip latency checks']
  - date: 2025-10-08
    title: 'Repair, reflect and re-emerge'
    items: ['Rebuilt the chat interface with ncurses', 'Per-client rate limiting with a token bucket', 'A word of the day for each session']
  - date: 2025-10-21
    title: 'Wanted dead ~~or~~ and alive'
    items: ['CRYSTALS-Kyber-768 for the session key, replacing Diffie-Hellman', 'AES-256-GCM for messages, replacing Vigenère', 'Makefile and setup script for first-time users']
---

AnonComm started as a plain socket chat and grew, one dated iteration at a time, into a small exercise in doing private messaging properly. The build log below records every step, including the parts that were wrong at first.

## Where it ended up

- **Key exchange:** the session key is agreed with CRYSTALS-Kyber-768 through the Open Quantum Safe library (liboqs). Kyber is a lattice-based scheme designed to resist attacks from quantum computers. It replaced classic Diffie-Hellman.
- **Signatures:** CRYSTALS-Dilithium, the matching post-quantum signature scheme, also through liboqs.
- **Encryption:** messages are encrypted and authenticated with AES-256-GCM. It replaced the Vigenère cipher from the early versions.
- **Access control:** password authentication and an IP allowlist on the server.
- **Abuse protection:** per-client rate limiting using a token bucket.
- **Interface:** an ncurses terminal UI, with sending and receiving on separate POSIX threads.

## Why build it

Most of the value was in the path rather than the result: each step replaced something weak with something stronger, and the weak versions made it obvious why the strong ones exist.
