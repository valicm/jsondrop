---
"@jsondrop/core": patch
---

Measure `durationMs` and the `clientCredentials` token lifetime with `performance.now()` instead of `Date.now()`, which fails prerendering in Next.js under Cache Components.
