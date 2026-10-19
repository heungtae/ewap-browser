# Browser Agent S28 — Workspace, preserved UI seam and local backend bridge

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Platform/runtime maintainer. Migration slice: M02. Prerequisites: [S26](s26-migration-baseline.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Create the target app/package boundaries and authenticated local backend while preserving existing UI structure and keeping model/execution authority out of presentation code.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF01, RF02, RF09, RF18, RF23–RF29**. Current sources: [service-worker/runtime-registration.ts](../../extension/src/service-worker/runtime-registration.ts), [service-worker/runtime-platform.ts](../../extension/src/service-worker/runtime-platform.ts), [native/native-client.ts](../../extension/src/native/native-client.ts).

Planned destinations/deliverables: `apps/chrome-extension/`, `apps/agent-server/{src/native,src/ipc,src/settings}/`, package exports and extension presentation/bridge adapters.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                                   | Acceptance / linked checks                                                                                                                         |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| S28-C1 | **Create isolated workspace builds.** Move browser app paths/assets and introduce package exports; separate Node/browser builds and version-preserving verification commands.            | Vite bundles existing HTML/TypeScript UI with unchanged presentation; no React, Node leakage or implicit version increment. Checks: S28-R01.       |
| S28-C2 | **Extract the presentation seam.** Split UI event/transport controllers from DOM view factories; preserve element IDs/classes, layout, focus, window ownership and management flows.     | TaskClient/Settings clients can render fixture results; UI imports no provider/dispatch/policy grant implementation. Checks: S28-R02.              |
| S28-C3 | **Implement native entry and authenticated IPC.** Add per-profile pairing, allowed extension IDs, per-user socket/pipe ACLs, handshake/version negotiation and bounded framed transport. | Unauthorized principals and incompatible versions cannot reach task/browser APIs; no default network listener. Checks: S28-R03.                    |
| S28-C4 | **Add event replay and transfer discipline.** Implement message IDs/digests, sequence/cursor replay, chunk integrity/backpressure, cancellation and browser-unavailable states.          | Reconnect resynchronizes without duplicate results or unbounded buffers; disconnected browser cannot use cached handles. Checks: S28-R04, S28-R05. |
| S28-C5 | **Provide local setup and observability seams.** Add backend launcher/install/repair skeleton, capability health, public settings/secret-store port and cross-process correlation.       | Missing host and setup errors appear in existing status regions; secrets never enter public settings or traces. Checks: S28-R06.                   |

## Verification scenarios

| ID      | Scenario                 | Expected evidence                                                                                                                                      |
| ------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S28-R01 | Build boundaries         | Assert emitted browser paths/CSP/MAIN helper behavior, no Node modules in extension, no Chrome calls in backend, preserved UI assets.                  |
| S28-R02 | UI adapter               | Replay baseline chat/settings/profile/approval screens and focus traversal; compare structure and allowed wording changes.                             |
| S28-R03 | Authentication           | Wrong extension ID, profile credential, socket principal and protocol major reject before state access.                                                |
| S28-R04 | Transport integrity      | Oversize/conflicting/reordered chunks, stalled ACK and expired transfer fail within byte/time caps; no partial trusted payload.                        |
| S28-R05 | Reconnect                | Lose Worker/Panel/native connection, resume event cursor or snapshot; no duplicate card/final result and truthful waiting status.                      |
| S28-R06 | Installation and secrets | Missing host, wrong executable/version, session-only credential mode and blank writes produce truthful readiness without plaintext secret persistence. |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

App/package build and boundary tests, native framing/IPC integration, controlled Chrome presentation smoke and initial installer dry run.

Record results in a dated file under `docs/evidence/` named for S28; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S28-C cards and S28-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Keep the old production entrypoint selected until the target vertical paths qualify. Remove target host registration safely; preserve user data and original package identity.

S29/S30 consume ports, not Worker globals. Production app ownership is not switched merely because the bridge works.
