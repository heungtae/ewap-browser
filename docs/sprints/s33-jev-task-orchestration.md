# Browser Agent S33 — JEV-owned Ask/Act and workflow orchestration

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Task Engine maintainer. Migration slice: M07. Prerequisites: [S27](s27-jev-controller-contract.md), [S29](s29-semantic-codebase-construction.md), [S31](s31-durable-task-recovery.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Replace the Worker Ask/Act/harness loops with durable JEV decisions over the Codebase and shared runtime, including bounded planning, recovery and goal acceptance.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF02–RF06, RF16, RF22, RF23, RF25**. Current sources: [service-worker/act-step-runner.ts](../../extension/src/service-worker/act-step-runner.ts), [service-worker/act-harness-turns.ts](../../extension/src/service-worker/act-harness-turns.ts), [service-worker/ask-chat-runner.ts](../../extension/src/service-worker/ask-chat-runner.ts), [service-worker/act-goal-finalizer.ts](../../extension/src/service-worker/act-goal-finalizer.ts).

Planned destinations/deliverables: Task Engine phase reducer/advance-task/plan/decision modules and the complete presentation task adapter.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                                       | Acceptance / linked checks                                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| S33-C1 | **Implement reference phases.** Wire intent, discovery, planning, approval, execution, verification, analysis delegation and acceptance plus input/suspend/cancel.                           | Illegal transitions fail; every phase change is journaled with current role, evidence and budgets. Checks: S33-R01.                                  |
| S33-C2 | **Replace Ask and Act entry paths.** Admit both existing mode controls into the same backend engine with mode-scoped capabilities and current graph candidates.                              | Ask remains read-only; Act planning never grants permission; disabled/missing JEV prevents new autonomous admission. Checks: S33-R02.                |
| S33-C3 | **Expand plans and workflows through one registry.** Select typed plan fragments, source-bound arguments and advisory learned/imported workflows; preserve scope/plan revision.              | No direct workflow/learned executor or GPT controller fallback; multi-page/tab transitions require current ownership. Checks: S33-R03.               |
| S33-C4 | **Implement bounded recovery and acceptance.** Inspect missing evidence, replan only before safe dispatch boundaries, detect no progress and independently enforce goal predicates.          | Verified steps never repeat; UNKNOWN dispatch and later goal changes remain distinct and truthful. Checks: S33-R04.                                  |
| S33-C5 | **Complete UI/live controller qualification.** Connect current prompts/progress/history and verify all reference task flows with actual JEV; analyst can remain a controlled port until S34. | Model tool choice, execution, same-task result continuation and final UI are recorded, not inferred from idle/HTTP status. Checks: S33-R05, S33-R06. |

## Verification scenarios

| ID      | Scenario            | Expected evidence                                                                                                                                  |
| ------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| S33-R01 | Phase journal       | Enumerate valid/invalid transitions and interruption at each phase; accepted terminal state cannot be reopened by late events.                     |
| S33-R02 | Mode/readiness      | Ask requests requiring a date filter cannot mutate; no/disabled/failed JEV cannot promote GPT or make background TypeSafe calls when disabled.     |
| S33-R03 | Plan/workflow scope | Imported/learned recipe, changed args, cross-origin route and task-tab switch use one registry with fresh bindings and correct plan revision.      |
| S33-R04 | Recovery/goal truth | No-progress loop, stale capability, post-dispatch timeout and already-verified navigation with later goal mismatch do not repeat mutation.         |
| S33-R05 | Presentation        | Existing Stop/approval/value/selection/history flows survive reconnect and exactly one accepted final result is displayed.                         |
| S33-R06 | Live JEV loop       | Observe real selected tools and continuation for aggregation, search and complex-plan delegation on held-out tasks; preserve failures and budgets. |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Task reducer/candidate/plan/goal tests, controlled Chrome full-loop and window-ownership regressions, required live JEV semantic qualification.

Record results in a dated file under `docs/evidence/` named for S33; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S33-C cards and S33-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Stop new target admission, cancel/drain existing tasks and preserve receipts. Return only newly admitted tasks to the pinned legacy runtime during development; no mid-task fallback.

S34 provides the real analyst; S35 adds external entrypoints. Advanced-channel completeness joins at S36.
