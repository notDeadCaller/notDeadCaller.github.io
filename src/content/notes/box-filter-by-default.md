---
title: 'Box-filter by default when you shrink'
description: 'Nearest-neighbour downsampling aliases and looks muddy; averaging the source pixels under each target cell is a few more lines and far cleaner.'
pubDate: 2026-08-25
tags: ['graphics']
maturity: budding
---

Every time I have sampled a big image down to a small grid with nearest-neighbour, it has aliased — thin features flicker or vanish. Averaging every source pixel that falls under a target cell (a box filter) fixes it for a trivial cost.

It is the difference between a muddy ASCII portrait and a readable one. Reach for the average first; only optimise the sampling if it actually shows up in a profile.
