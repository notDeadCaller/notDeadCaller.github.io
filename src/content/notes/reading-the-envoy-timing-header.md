---
title: 'Reading the Envoy timing header'
description: 'x-envoy-upstream-service-time hands you the backend processing time with the network subtracted out — a cleaner signal for timing oracles than wall-clock latency.'
pubDate: 2026-09-10
tags: ['web', 'timing']
maturity: budding
---

When a service sits behind Envoy, responses often carry `x-envoy-upstream-service-time`: the milliseconds the upstream actually spent, measured server-side. That subtracts network jitter for you, so a timing side channel that would need hundreds of samples over the wire can show up in a handful of requests.

I reach for it first on any Envoy-fronted target before setting up a latency harness. If the header is there, the measurement is half done.
