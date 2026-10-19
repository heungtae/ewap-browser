# Browser Agent S30 — Shared Tool Registry, policy and browser execution

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Execution/policy maintainer. Migration slice: M04. Prerequisites: [S28](s28-workspace-backend-bridge.md), [S29](s29-semantic-codebase-construction.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Establish one model-independent validation, approval, dispatch and verification path with honest tool availability and fresh browser binding.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF06–RF08, RF11, RF14, RF15, RF19**. Current sources: [service-worker/act-proposal-executor.ts](../../extension/src/service-worker/act-proposal-executor.ts), [content/preflight.ts](../../extension/src/content/preflight.ts), [content/executor.ts](../../extension/src/content/executor.ts), [policy/approval-policy.ts](../../extension/src/policy/approval-policy.ts).

Planned destinations/deliverables: `packages/{tool-registry,tool-runtime,policy-engine,browser-runtime}/`; registry schemas and prepared-step/receipt contracts.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                             | Acceptance / linked checks                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S30-C1 | **Consolidate registry and wire schemas.** Define canonical tool IDs, schemas, effects, capability/verifier requirements and collision-free wire-name mapping.                     | All 20 standard tools plus registered invoke_action have inventory records; unimplemented advanced/analysis executors remain unavailable until their owning Sprint. Checks: S30-R01. |
| S30-C2 | **Prepare current action bindings.** Resolve semantic refs to ephemeral targets and bind mode/owner/plan/capability/document/argument/predicate revisions.                         | Unique actionable target and current verifier required; no-op returns zero-dispatch receipt. Checks: S30-R02.                                                                        |
| S30-C3 | **Unify risk, consent and approval.** Implement target effect categories, deny precedence, trusted UI/policy approval receipts, disclosure scope and hard-risk floor.              | Ask cannot mutate; Full cannot bypass destructive/bulk/external-transfer task approval; models/MCP cannot mint approval. Checks: S30-R03, S30-R04.                                   |
| S30-C4 | **Extract browser dispatch and observation.** Adapt DOM/checked/select/navigation and bounded CDP input to the shared pipeline; registered business actions use the same boundary. | Actual effect and independent postcondition are recorded separately; arbitrary JS/functions/API replay remain unavailable. Checks: S30-R05.                                          |
| S30-C5 | **Wire existing approval UI and continuation.** Project prepared prompts and receipt events through preserved cards and bind all responses to exact prompt/plan revisions.         | Stop, stale card, late response and unsupported verifier cannot execute; results retain the originating tool invocation. Checks: S30-R06.                                            |

## Verification scenarios

| ID      | Scenario           | Expected evidence                                                                                                                            |
| ------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S30-R01 | Schema parity      | Advertised schema without current executor/verifier is rejected by inventory checks; wire-name aliases remain one-to-one.                    |
| S30-R02 | Target/no-op       | Already-satisfied, stale/duplicate/hidden/occluded/disabled targets produce zero dispatch; a valid fresh target uses one adapter.            |
| S30-R03 | Mode and risk      | Ask fill/click/navigation, sensitive input, unknown autosave and Full destructive action obey their exact deny/approval rules.               |
| S30-R04 | Approval authority | Forged model/MCP approval, changed arguments/plan/policy/epoch and expired prompt fail; trusted current explicit approval consumes once.     |
| S30-R05 | Execution truth    | Registered UI/API action returns independent postcondition evidence; missing verifier or arbitrary method path never dispatches.             |
| S30-R06 | UI continuation    | Card ordering, current value input, source consent and cancellation work through the existing UI; receipt returns under the correct tool ID. |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Registry/schema/policy/preflight/adapter tests; controlled Chrome approval-to-dispatch-to-observation regressions including old capability-parity and no-op issues.

Record results in a dated file under `docs/evidence/` named for S30; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S30-C cards and S30-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Target runtime remains separately selected and task-pinned. Revoke all unexecuted target approvals before disabling it; never route a prepared target step into legacy execution.

S31 adds durable journals around this sole path before autonomous S33 execution.
