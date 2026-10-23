---
title: 'An ASCII sphere is one dot product'
description: 'The planets on this very page are a circle, a fake surface normal, and a single dot with a light direction — then map brightness to characters.'
pubDate: 2026-08-28
tags: ['graphics', 'ascii']
maturity: evergreen
---

For each cell inside a circle of radius R, treat the offset as `(nx, ny)` and recover depth with `nz = sqrt(1 - nx^2 - ny^2)`. That is a point on a unit hemisphere. Dot it with a light direction and you have brightness; index that into a ramp like ` .:-=+*#%@` and the flat disc reads as a lit ball.

Add a rotating longitude term for surface bands and it looks like it is spinning. No 3D library, no shaders — just one dot product per character. The whole Notes sky runs on this.
