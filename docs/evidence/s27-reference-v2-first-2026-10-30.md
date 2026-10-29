# S27 v2 reference next-step verification — 2026-10-30

The [first live report](s27-reference-v2-first-2026-10-30.json) records 12/12
matching next-step decisions from `jev-1.13.0` over the original frozen
reference requests: aggregation, exact `EQP001` search and date-qualified
analysis, each in English/Korean and both candidate orders. All 12 native calls
returned HTTP 200. The task IDs were random and did not include scenario labels.
The original requests were previously observed and are reference cases, not an
independent holdout; the separately authored [cross-case evaluation](s27-cross2-first-2026-10-29.md)
provides the new independent synthetic selection coverage.

For each chosen candidate, the checker reconstructs the frame and the source
bindings from the original corpus and the exact opaque context. It verifies all
16 bound arguments, including user-supplied `EQP001`, the observed dataset and
the admission-time `Asia/Seoul` previous-day interval. For every argument, a
different individually valid source is rejected by the selected candidate as
`ARGUMENT_SOURCE_CHANGED`. The checker also reparses the bounded native body,
checks the locally attached result and compares source, request and runner
digests. The adapter attaches correlation locally; no provider echo is claimed.

`pnpm check:s27:reference` checks the current source against the saved report;
`node --test scripts/s27/check-reference.test.mjs` verifies that changed source
digests, native bodies and negative evidence do not pass. The
[source snapshots](../baselines/s27-reference-v2/) preserve the runner, fixture
and checker. No actual browser operation, approval or real user data occurred.

The earlier [full v1 run](s27-v1-current-2026-10-29.json) remains failed: this
v2 reference check does not relabel its overall outcome or establish complete
task continuity. A prior independent review found that v1 provenance summaries
could not be recalculated; this run records the necessary frame and source
context rather than treating those summaries as independently verified.
