# Browser Agent S31 — Durable tasks, dispatch receipts and recovery

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Task Engine/runtime maintainer. Migration slice: M05. Prerequisites: [S30](s30-shared-tool-policy-runtime.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Move task progress out of Worker memory and preserve truthful at-most-once dispatch attempts across crashes, reconnects, duplicates and cancellation.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF05, RF06, RF08, RF25, RF27**. Current sources: [service-worker/request-store.ts](../../extension/src/service-worker/request-store.ts), [service-worker/request-persistence.ts](../../extension/src/service-worker/request-persistence.ts), [state/mutation-coordinator.ts](../../extension/src/state/mutation-coordinator.ts), [state/tab-chat-session-store.ts](../../extension/src/state/tab-chat-session-store.ts).

Planned destinations/deliverables: Backend SQLite journal/leases, TaskStore/reducer/budget accountant, browser dispatch ledger and presentation event replay.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                           | Acceptance / linked checks                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| S31-C1 | **Persist task/event projections atomically.** Implement unique request IDs/digests, task revisions, ordered events, leases and per-tab runtime fencing.                         | ACK follows durable admission; duplicate request is the same task; no two writers advance one task/tab. Checks: S31-R01.                              |
| S31-C2 | **Journal dispatch reservation and receipts.** Persist backend intents and browser reservations before effects, with prepared digests and command progress.                      | Same dispatch ID is idempotent; conflicting IDs reject; crash after reservation cannot trigger automatic replay. Checks: S31-R02.                     |
| S31-C3 | **Reconcile restart and navigation.** Recover leases, receipts, current page/profile/runtime epoch, pending prompts and evidence; invalidate old live bindings.                  | Safe reads can resume; unknown effects stay unknown; changed document requires fresh authority. Checks: S31-R03.                                      |
| S31-C4 | **Implement cancellation, deadlines and retention.** Persist generation/revocation intents, active/overall budgets, expiries and bounded terminal receipt retention.             | Offline Stop blocks browser dispatch immediately; no reconnect/cancel/TTL event reopens expired commands or resets budgets. Checks: S31-R04, S31-R05. |
| S31-C5 | **Project reliable history and diagnostics.** Rebuild existing UI states from committed events, correlate first failures and receipts, separate action outcome from goal status. | No duplicate final answer/card; a verified action stays recorded when later goal evidence is incomplete. Checks: S31-R06.                             |

## Verification scenarios

| ID      | Scenario               | Expected evidence                                                                                                                                      |
| ------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S31-R01 | Admission/concurrency  | Lost ACK, repeated request with changed digest and simultaneous JEV/MCP writers preserve one task/lease and reject conflicts.                          |
| S31-R02 | Dispatch crash windows | Crash before reservation, after browser reservation, after partial CDP input and before receipt ACK; verify exact dispatch count and UNKNOWN behavior. |
| S31-R03 | Recovery binding       | Worker/backend restart, route change and profile/tab mismatch cannot restore stale targets/approvals; original receipts reconcile.                     |
| S31-R04 | Cancellation race      | Cancel before/after dispatch and during disconnection; reject late generations and report cancellation pending until acknowledged.                     |
| S31-R05 | Budget/expiry          | Repeated reconnect/retry/user wait and expired terminal receipt retention do not reset counters or permit delayed dispatch.                            |
| S31-R06 | Presentation/history   | Replay lost/reordered events and post-verification goal uncertainty; correct single terminal view and retained first failure.                          |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

SQLite/IndexedDB fault injection and concurrency integration, reducer/property tests for illegal transitions, controlled Chrome restart/cancel/navigation matrix.

Record results in a dated file under `docs/evidence/` named for S31; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S31-C cards and S31-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Drain/fence target tasks and keep receipt journals. Reverting code does not erase ambiguity or authorize old runtime to repeat a dispatched step.

Durability is required for advanced task-driven collection, the JEV loop and external clients.
