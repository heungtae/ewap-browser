# S6 NFR and lifecycle evidence

## Measurement boundary

The release candidate uses deterministic local evidence, not fabricated production latency numbers. The browser fixture runner is the stability measurement; debugger lifecycle is verified at the company stop boundary.

| Measure | Method | Result | Limit |
|---|---|---|---|
| fixture stability | `npm run test:fixtures` | pass | no managed-origin timing claim |
| policy test duration | `npm run test:company` | pass | test machine only |
| Stop lifecycle | `stopCompanyRun()` contract | abort, diagnostics disable, debugger detach all requested | browser-level detach observation still required for GO |
| memory | no persistent profiler in candidate | not claimed | production qualification must collect it |

No latency/memory threshold is accepted as evidence until the managed endpoint and enterprise fixture are available.
