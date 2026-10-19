# S27 controller protocol implementation — 2026-10-19

**In Progress: C1–C4 implemented; C5/R06 live feasibility FAILED. S27 is not complete.**
The architecture and original S27 Sprint design are unchanged. Per the failed
M01 gate, S33 completion and migrated autonomous activation remain blocked.
This result does not establish that every possible JEV envelope is infeasible;
it records failure of the exact pinned envelope and holdout tested here.

Entry revision: `020cbbf6a` (`master`, clean before implementation), extension
package/manifest 0.1.117. The current implementation has uncommitted S27 changes.
[Entry hashes and environment](../baselines/s27/entry.json) and
[successor preservation inventory](../baselines/s27/disposition.json) retain S26's
original inventory without rewriting it. Existing S26 source-size/diagnostics
baseline failures remain historical and are not fixed by this Sprint.

## Delivered code and acceptance scope

| Card / scenario | Source and verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | State                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| C1 / R01        | [Closed frame/candidate schemas](../../packages/task-engine/src/decisions/schema.ts), [frame integrity](../../packages/task-engine/src/decisions/frame.ts), [acceptance](../../packages/task-engine/src/decisions/accept-result.ts): exact task/plan/graph/evidence/capability/cancellation, candidate/frame digests, template/model revisions and control outcomes. Wrong revisions, foreign selections and unknown fields reject.                                                                                                                                         | Implemented; deterministic tests pass                   |
| C2 / R02        | [Candidate pages](../../packages/task-engine/src/decisions/candidates.ts), [source bindings](../../packages/task-engine/src/decisions/bind-argument.ts), [fragment binding](../../packages/task-engine/src/decisions/bind-fragment.ts), [timezone transform](../../packages/task-engine/src/decisions/relative-day.ts): 28 domain + four control outcomes, stable ranking, bound cursors, omissions, exact EQP001/user/approved/observed sources, units and DST-aware dates. Candidate digests include argument-source digests; changed sources require new input/planning. | Implemented; deterministic tests pass                   |
| C3 / R03        | [Native adapter](../../packages/provider-adapters/src/jev/client.ts), [native parser](../../packages/provider-adapters/src/jev/native-response.ts), [bounded stream reader](../../packages/provider-adapters/src/jev/read-native-json.ts). Reuses native POST/choice/score/noul validation algorithms with parity checks against the old parser, without importing legacy runtime into the new package.                                                                                                                                                                     | Implemented; deterministic tests pass                   |
| C4 / R04        | [Budget accountant](../../packages/task-engine/src/decisions/budget.ts), [controller port orchestration](../../packages/task-engine/src/decisions/controller.ts), [mode limits](../../packages/task-engine/src/decisions/mode-capabilities.ts). No GPT fallback, execution/approval method or new dispatcher. Missing/disabled/429/network/timeout/stale/duplicate-state handling retains counters and first failure.                                                                                                                                                       | Implemented; deterministic tests pass                   |
| C5 / R05        | [Frozen requests](../baselines/s27/holdout.json), [scenario fixtures](../../extension/tests/fixture/s27-scenarios.ts), [unit evaluation](../../extension/tests/unit/migration/s27/scenarios.test.ts). Three reference scenarios × English/Korean × forward/reversed candidates, eight decision families per task. Fixture-selected answers test protocol mechanics, not semantic model accuracy.                                                                                                                                                                            | Controlled mechanics pass; live semantics not qualified |
| C5 / R06        | [First live failure](s27-live-first-attempt-2026-10-19.json), [finite-answer instrumentation](s27-live-finite-answers-2026-10-19.json), [final current-source run](s27-live-final-2026-10-19.json).                                                                                                                                                                                                                                                                                                                                                                         | **FEASIBILITY_FAILED**                                  |

Package exports expose only the S27 decision and native-adapter surfaces. Root
workspace/type/lint configuration includes these packages so they are checked;
full extension/server/MCP workspace migration and packaging remain S28 work.
The original extension providers/UI/runtime stay byte-for-byte unchanged and no
production routing selects the target controller. Analysis is only a finite
processor proposal here; S34 owns actual `AnalysisRequest`/analyst execution.

Schemas have one closed Zod definition with checked JSON Schema golden exports
under `extension/tests/fixture/s27-contracts/`. No separate design schema was
edited. `pnpm check:s27` checks package exports, AST dependencies, bundle graph,
source size, schema goldens, inventory completeness and original design/product
hashes. `pnpm check:s27:qualification` is a separate **failing activation gate**;
it must not be treated as a passing test or bypassed by fixture results.

## Live result and first failures

Endpoint `https://api.typesafe.ai/v1/systemone`, pinned model `jev-1.13.0`,
native choice/noul wire protocol, internal `wca.task/v1`, template `controller-v1`.
Credentials came from the existing interactive-shell environment, without
printing, storing or embedding their values. The report contains only finite
selections/probabilities, digests, counters, timing and sanitized error codes.

The corpus SHA-256 is
`88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570`.
It was frozen before the first live call. Expected outcomes, confidence floor,
selected-option probability floor and evidence-sufficiency floor were never
relabeled or lowered. All three floors remain 0.9.

- First run: 12 tasks / 96 native calls, all HTTP 200; zero accepted tasks.
  The first report retains gate outcomes and sufficiency; raw finite proposals
  were not yet instrumented. It is not silently replaced by later results.
- Instrumented run: the same 12 case IDs, 96 calls, 78/96 proposed labels matched
  expected labels; zero accepted tasks. Every sufficiency value was below 0.9.
- Provenance/target-binding run: [retained report](s27-live-provenance-2026-10-19.json),
  96 calls, 75/96 expected proposals, zero accepted decisions. It predates the
  final conservative output-byte reservation check and does not qualify current code.
- Final current-source run after output-byte/accounting hardening:
  96 HTTP 200 responses, 71/96 proposed labels matched; **0/96 accepted decisions,
  0/12 qualified tasks**. There were 39 low-confidence and 57 insufficient-evidence
  rejections. Sufficiency ranged from 0.24 to 0.72. The report pins the bundled
  protocol source digest in addition to per-frame/candidate digests. No response
  crossed the conservative output byte envelope; gates remained unchanged.

Attempts remain separate; the holdout denominator stays 12 tasks, never 48
success opportunities. Final evaluation assigns fresh admitted task IDs to
independent tasks; each task retains one budget across its eight decision phases.
Earlier attempts do not qualify current code. Actual model-pair/Chrome search,
real analyst findings, MCP and OS installation were not exercised.

The final search tasks contacted only the JEV endpoint: **zero GPT controller
calls, zero browser dispatches and zero minted approval facts**. Because the
confidence/sufficiency gates failed, this is not a successful EQP001 workflow.
No post-dispatch retry, fallback or new user approval flow was introduced.

The synthetic graph cases intentionally describe known relations/coverage; they
are not evidence produced by the future S29 builder. Their recovery labels are
frozen strict labels, not proof that all alternative read-only recovery strategies
would be unsafe. The failure therefore cannot be generalized to JEV capability
outside this tested request envelope.

## Executed checks

- `pnpm install --no-frozen-lockfile`: workspace dependencies installed with pinned
  pnpm 9.15.4 and Zod 4.6.7; lockfile updated. Extension version unchanged.
- `pnpm typecheck`: root, package and test contracts pass.
- `pnpm test:s27`: dedicated contract/binder/native/budget/scenario regressions pass.
- `node scripts/s27/export-contracts.mjs`: five generated schemas match their goldens.
- `pnpm check:s27`: package/dependency/source-size/inventory/hash checks; final results
  are recorded below after the successor manifest is enumerated.
- Full unit, fixture and E2E checks; root module boundaries; lint; version-preserving
  extension build/package checks are recorded in the final verification record.
- `bash -ic 'S27_REPORT=/tmp/s27-live-final.json node scripts/s27/live-qualification.mjs'`:
  **exit 1, FEASIBILITY_FAILED**, current-source report retained above.
- `node scripts/s27/check-qualification.mjs`: **exit 1**, rejects the failed report
  and explicitly blocks S33 completion. No HTTP-success-only acceptance.

First attempts included a new test import/typecheck error, subsequently fixed;
no production behavior was changed to pass a test. Source-size fixture splitting
and finite-answer instrumentation are implementation changes, not design edits.
The final report identifies the exact protocol bundle; subsequent changes to that
bundle invalidate qualification even if an old report claimed PASS.

## Handoff

S29 may implement deterministic graph work under its own prerequisites. Semantic
annotation activation and S33 completion still require a passing live S27 gate.
Do not activate migrated autonomous tasks or promote GPT to controller to hide
this result. Existing production behavior remains available through the original
path until its separately qualified cutover.

The original `docs/sprints/s27-jev-controller-contract.md` and all architecture
and Sprint designs are preserved byte-for-byte at the user's instruction. Current
implementation status is recorded in this evidence, the Sprint index and progress
ledger rather than editing the design's original Planned header or acceptance.

## Final local verification

[Machine-readable results](../baselines/s27/verification.json) pin the new source
hashes and current protocol bundle. Full unit **1,048/1,048**, S27 **55/55**
(included in full unit), fixture **1/1** and E2E **1/1** passed. Typecheck, lint,
five schema goldens, 20 package modules/exports/bundle graph and 423 legacy
extension module boundaries passed. The successor inventory covers **1,201 files,
30 RF owners**; **495 original design/product hashes** match entry exactly.
`pnpm install --frozen-lockfile --offline` passed. The extension build and package
validation passed without changing 0.1.117. Global source-size still reports the
same 88 historical violations; S27 added none, and its package/test source files
are individually checked against the 199-line limit.

The final report's protocol fingerprint matches current bundled implementation.
The qualification command nevertheless exits 1 on FEASIBILITY_FAILED, as required.
There is no completed Sprint claim, automatic activation, primary fallback,
credential export or newly verified production workflow.
