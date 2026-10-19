# Browser Agent S37 — Production cutover and legacy runtime retirement

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Product/release maintainer. Migration slice: M11. Prerequisites: [S36](s36-migration-qualification.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Complete the migration by switching new-task ownership, removing obsolete execution architecture and verifying the installed release without changing UI structure.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF01–RF30**. Current sources: [service-worker/runtime-chat.ts](../../extension/src/service-worker/runtime-chat.ts), [service-worker/runtime-registration.ts](../../extension/src/service-worker/runtime-registration.ts), [offscreen/entry.ts](../../extension/src/offscreen/entry.ts), [native/native-client.ts](../../extension/src/native/native-client.ts).

Planned destinations/deliverables: Final target production entrypoints/artifacts, retired legacy source/routes/writers/shims, current source links and installed release evidence.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                                         | Acceptance / linked checks                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| S37-C1 | **Fence admission and commit the switch.** Drain legacy runs, reconcile uncertain receipts, validate migration manifest acknowledgments and advance runtime epoch.                             | Exactly one runtime accepts new production tasks; delayed old messages cannot dispatch. Checks: S37-R01.                                     |
| S37-C2 | **Remove competing orchestration.** Delete old Ask/Act/harness/provider loops, learned/workflow direct executors and production fixture/legacy bypass routes after caller checks.              | One Task Engine, Registry/Runtime and policy path remain; no primary-model controller fallback. Checks: S37-R02.                             |
| S37-C3 | **Retire storage/transports and temporary shims.** Disable old writers, remove offscreen provider-fetch and .NET placeholder host paths, remove runtime selector and temporary re-exports.     | Backups are inspection/recovery data only; no old key/message reopens execution; package contents match the new system. Checks: S37-R03.     |
| S37-C4 | **Verify complete final repository and UI.** Run exact per-file disposition, import/message/store/asset consumer checks, final contracts/regressions and source navigation.                    | No unmapped source or undocumented adapter; new modules meet size/boundary rules and existing UI structure remains. Checks: S37-R04.         |
| S37-C5 | **Deliver and verify the compatible release.** Publish/install the authorized release set using its normal delivery process, verify artifacts and upgrade/rollback on supported installations. | Record actual delivered/installed versions and digests; source commit/tag/build alone cannot complete this Sprint. Checks: S37-R05, S37-R06. |

## Verification scenarios

| ID      | Scenario              | Expected evidence                                                                                                                                     |
| ------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| S37-R01 | Single owner          | Race legacy delayed commands and new tasks across cutover; runtime epochs and tab locks allow only the chosen owner.                                  |
| S37-R02 | No bypass             | Search/import/artifact tests prove removal of direct CHAT_SEND/START_ACT/fixture/learned/workflow executors and PRIMARY_LLM controller fallback.      |
| S37-R03 | Retirement integrity  | Old storage keys, offscreen/provider/native registrations and temporary aliases cannot execute; original recovery data stays available within policy. |
| S37-R04 | Final regression      | All target suites, source-size/boundaries, UI baseline and 15-reference-section/20-standard-tool coverage pass at the final revision.                 |
| S37-R05 | Actual delivery       | Verify registry/release/installer artifact digests and running extension/backend/MCP versions on the declared supported installation set.             |
| S37-R06 | Post-cutover rollback | Drain target tasks and restore the prior compatible release/namespace without repeated effects; retain target evidence inspection-only.               |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Final full qualification at the release revision, retirement/bundle audits, supported install/upgrade verification and actual published artifact checks.

Record results in a dated file under `docs/evidence/` named for S37; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S37-C cards and S37-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Freeze target admission, drain/cancel tasks, preserve ambiguous receipts, restore the prior compatible release set and untouched legacy namespace. Never reverse-convert new graph/tasks into grants.

Only this exit completes migration for the explicitly qualified release scope. Keep remaining external/site/OS qualifications visible; do not rewrite historical S0–S25 evidence.
