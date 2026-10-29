# S27 native controller qualification — 2026-10-30

**PASS within the native controller qualification scope.** The live native `controller-v2` evidence covers all original reference sequences and independently authored synthetic phase observations. It does not qualify browser dispatch, production routing, multi-process orchestration, MCP, operating-system installation or release. The current product remains on its existing entrypoint; S33 and subsequent integration and release acceptance remain separately In Progress.

The user explicitly removed numerical confidence/probability/sufficiency gates
and permitted excluding questions whose expected answer is ambiguous. Valid
responses with no expected label are checked as responses rather than assigned a
fabricated correct answer. Framing, candidate and source binding, malformed
response checks, mode/policy constraints and explicit control outcomes remain.

| Requirement | Evidence for this qualification |
| --- | --- |
| R01 frame integrity | `pnpm test:s27`: wrong frame/candidate digests, foreign model/context and stale revisions reject; boundary and contract goldens pass. |
| R02 parameter provenance | Unit tests cover user/approved/observed sources, stale and sensitive data and admission-time timezone transformation. The [v2 reference run](s27-reference-v2-first-2026-10-30.md) independently reconstructs 16 selected-fragment bindings across all 12 original reference cases and rejects individually valid alternate sources. |
| R03 native validation | Unit tests reject missing/extra fields, foreign choices, invalid distributions and incomplete frames; low numeric scores alone no longer reject, by user instruction. |
| R04 role and budget isolation | Unit tests cover unavailable/disabled controller, 429, timeout, shared retry budget, no-progress and stale/cancelled context. The S27 dependency boundary and native-adapter graph exclude GPT controller fallback. |
| R05 scenario semantics | The original reference corpus has 96/96 live decisions across 12 shared-budget sequences and 16 reconstructed argument bindings with source-change negatives; the independently authored [cross-case run](s27-cross2-first-2026-10-29.md) covers read, explicit search and analysis decisions, including query/dataset provenance and source-change negatives. No browser dispatch or GPT controller calls occurred. |
| R06 live qualification | The first cross-case run records 288/288 matching observations across 12 new Korean/English requests, both candidate orders, independent Ask/Act intent modes and crossed evidence/recovery conditions. Native response bodies are reparsed against reconstructed frames and requests. The separate reference sequence run records 96/96 matching v2 phase decisions with shared context and budget. |

`pnpm check:s27:qualification` executes the boundary and S27 unit checks,
unlabeled-response and report-tampering tests, original reference sequence and observation
checks, reconstructed v2 reference binding checks, selected-fragment negative
checks and the 288-observation report checker. The original
`pnpm check:s27:qualification:v1` remains available and **fails** on the retained
v1 full-run report. The earlier 2/12 v1 result and the first ambiguous cross-case
attempt were not changed or counted as passing cases.

Verification used Node `v20.19.6`, pnpm `9.15.4`, Linux x86_64 and source base
`764ac9e88e9d5912b74ab99ae0f086330cf5bfa8` with the documented uncommitted
changes. `pnpm test:unit` passed 1,402 tests; fixture and E2E suites passed;
typecheck, lint, module boundaries, version-preserving build and package policy
validation passed. The live reports pin their actual bundled source and fixture
digests. Native `jev-1.13.0` calls, first attempts, HTTP statuses, results and
scope are recorded in the linked evidence. No credential or real page data was
stored. Live task continuity and actual execution are S33/S36 gates, not
established by this S27 result.

Independent GPT-6.1 Sol (low) review found that the earlier independent-binding
summary cannot be reconstructed from its retained report. It is historical
execution evidence only and is excluded from the formal gate. The reference
sequence and cross-case checkers independently reconstruct selected bindings and
reject alternate sources; the reviewer found no other scoped completion blocker.
