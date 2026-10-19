---
art: eye
title: 'Chakshu'
description: 'A personal safety Android app that records, timestamps and preserves evidence so no single authority can suppress it.'
year: 2026
stack: ['Kotlin', 'Android', 'OpenTimestamps', 'IPFS']
repo: 'https://github.com/notDeadCaller/Chakshu'
status: wip
featured: true
order: 1
log:
  - date: 2026-05-16
    title: 'The first blink'
    items: ['Phase 1 completed', 'Basic development build in progress']
---

Chakshu means "eye". It is a personal safety app for anyone walking home alone at night, built first for women and for anyone who has felt unsafe and known that feeling alone wasn't enough.

## What it does

A silent sequence of volume-button presses triggers it. Chakshu then starts recording audio, captures GPS location, and sends an SOS by SMS to trusted contacts. It needs no internet connection and no unlocking, and nothing visible happens on screen.

## Why it is built this way

Most safety apps trust someone to keep the evidence safe: a company server, a government system, the police. Chakshu is designed so that no single party can make the evidence disappear:

- Every audio chunk is hashed with SHA-256.
- The hashes are anchored to the Bitcoin blockchain through OpenTimestamps, which proves when each chunk existed.
- The audio is stored on IPFS, so there is no single server to subpoena or switch off.
- A public dashboard publishes a tamper-evident incident record the moment recording begins.

The evidence exists before anyone can decide it shouldn't.
