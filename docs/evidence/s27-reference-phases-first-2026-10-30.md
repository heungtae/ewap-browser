# S27 v2 reference phases — first live run, 2026-10-30

The [first live report](s27-reference-phases-first-2026-10-30.json) records
**96/96 matching decisions across all 12 original reference cases** using
native `jev-1.13.0`; all 96 HTTP responses were 200. The cases cover Ask alarm
aggregation, exact `EQP001` search and date-qualified analysis in English and
Korean with both candidate orders. Each case uses one opaque task ID, one
`DecisionController` and one shared `DecisionBudget` across eight decisions;
later frames include earlier actual selections. The user-directed policy does
not apply numerical confidence or sufficiency floors.

All 16 next-step arguments were reconstructed from their original user,
observed-data or relative-day sources. The checker also verifies that an
individually valid different source or timezone is rejected by the selected
fragment. It reparses each bounded native response, reconstructs the request and
frame, checks locally attached correlation, and verifies cumulative calls,
tokens, active-time continuity, limits, reservations and reserialized body
size. The provider's unsigned response does not independently prove wall-clock
deadlines or the exact original wire-byte count. The adapter does not claim
provider-echoed correlation.
`node --test scripts/s27/check-reference-phases.test.mjs` verifies that altered
sequence counters, active time, response limits, native responses or source
digests do not pass.

The v1 reference corpus had already been observed. These are **reference
regression cases, not a new independent holdout**. Earlier v1 full-run failures
remain in [their original report](s27-v1-current-2026-10-29.json). The
separately authored [cross-case first run](s27-cross2-first-2026-10-29.md)
provides independent synthetic phase-selection coverage. The user authorized
replacement of ambiguous labels; v2 gives the current phase explicit observed
facts and uses actual relation candidates. Both candidate orders use the same
no-safe-observation recovery condition; the cross-case suite separately tests
both recovery conditions in both orders.

The shared controller sequence tests decision and budget continuity only.
Each phase's observations, including successful verification receipts, are
hypothetical; no page action, actual receipt, user approval or real task result
occurred. Therefore this is not evidence of browser execution, recovery of a
real operation, S33 task orchestration, MCP, installation or release. Exact
[runner, fixture and initial checker snapshots](../baselines/s27-reference-phases/)
are retained. The report binds the runner and fixture hashes; the checker was
subsequently strengthened after review to verify budget accounting and is not
represented as provider-signed evidence. No credentials or real page data are
stored.

The run used Node `v20.19.6`, pnpm `9.15.4`, Linux x86_64 and source base
`764ac9e88e9d5912b74ab99ae0f086330cf5bfa8` with the recorded uncommitted
controller, fixture and checker changes. It was invoked in the interactive
credential environment with
`S27_REFERENCE_PHASES_REPORT=/tmp/s27-reference-phases-first-20261030.json node scripts/s27/live-reference-phases.mjs`.
The report records model, source digests, HTTP statuses, counters and outcomes;
no browser dispatch or approval was performed.
