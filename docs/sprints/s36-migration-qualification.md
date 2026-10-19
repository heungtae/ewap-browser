# Browser Agent S36 — Data conversion, UI continuity and release qualification

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Migration/release maintainer. Migration slice: M10. Prerequisites: [S32](s32-advanced-browser-collectors.md), [S34](s34-gpt-evidence-analysis.md), [S35](s35-mcp-external-adapters.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Qualify the complete target system, transactional cross-store migration and supported release set before changing production ownership.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF18, RF20–RF30**. Current sources: [service-worker/storage-bootstrap.ts](../../extension/src/service-worker/storage-bootstrap.ts), [settings/provider-settings.ts](../../extension/src/settings/provider-settings.ts), [learned-profile/store.ts](../../extension/src/learned-profile/store.ts), [deployment/compatibility.ts](../../extension/src/deployment/compatibility.ts).

Planned destinations/deliverables: Migration units MG01–MG06, installers/release manifest, full holdout/OS/client evidence and updated operational/source documentation.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                                                 | Acceptance / linked checks                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| S36-C1 | **Implement resumable converters and fencing.** Create source snapshots/digests, staging namespaces, per-store journals, quarantine and extension/backend commit acknowledgments.                      | No cross-store atomicity assumption; admission stays closed on incomplete conversion; rerun is idempotent. Checks: S36-R01.                   |
| S36-C2 | **Exercise rollback and active-task handling.** Drain/cancel legacy execution, preserve actual uncertainty and original namespaces; restore a compatible prior release set in a drill.                 | No pending approval/value/ref is imported as authority; target data never becomes legacy executable state. Checks: S36-R02.                   |
| S36-C3 | **Qualify UI structure and regressions.** Compare M00 visuals/DOM/focus/window behavior across chat, Settings, manager, workflow and diagnostics; inspect all intentional role/help changes.           | No UI redesign or lost controls; new internal ownership and truthful status remain observable through existing presentation. Checks: S36-R03. |
| S36-C4 | **Measure full quality and privacy targets.** Run frozen Ask/Act/controller/collector/analysis holdouts and all security/crash negatives; record first attempts and denominators.                      | All original metric targets meet the defined scope; one approval bypass or secret leak blocks release. Checks: S36-R04.                       |
| S36-C5 | **Package and test the release set.** Pin actual dependency/protocol/app versions, verify bundles and native host IDs, run clean install/upgrade/repair/uninstall on each declared supported OS.       | Artifact digests and compatibility agree; missing backend/version skew and session-only credentials are handled honestly. Checks: S36-R05.    |
| S36-C6 | **Prepare operational evidence and cutover manifest.** Update source/test/install/site guidance, finalize per-file disposition and old-consumer removal checklist, record external/live/OS exclusions. | Concrete release candidate and rollback procedure are reviewable; build/tag preparation is not a deployment claim. Checks: S36-R06.           |

## Verification scenarios

| ID      | Scenario                | Expected evidence                                                                                                                                                      |
| ------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S36-R01 | Conversion faults       | Malformed/v1/v2/disabled records, crash during copy/validation/commit, quota failure and repeated converter runs preserve originals and counts/digests.                |
| S36-R02 | Rollback/authority      | Unknown old dispatch, pending approval and new-only graph records never become a replay; prior namespace/release restores safely.                                      |
| S36-R03 | Presentation continuity | Fixed viewport/focus/keyboard, tab/window recovery, profile management, workflow preview and diagnostics match preserved structure.                                    |
| S36-R04 | Quality/security        | At least 100 Ask and 100 multi-step Action holdouts, actual metric denominators, all advanced adapters and zero approval/secret bypass; report live subset separately. |
| S36-R05 | Supported OS install    | Linux/Windows/macOS are each tested if claimed supported: host registration, IPC ACL, credential handling, restart, version skew, repair and uninstall.                |
| S36-R06 | Release traceability    | Final source/schema/dependency/fixture/provider/client/artifact versions connect to evidence; unsupported scope is explicit and not counted as PASS.                   |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Full package/type/lint/source-size/module-boundary suites, fixture/integration/Chrome/live/eval/MCP and supported-OS installer matrix with version-preserving builds before release.

Record results in a dated file under `docs/evidence/` named for S36; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S36-C cards and S36-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Before cutover, keep legacy active and source data intact. Any failed conversion/qualification leaves target admission disabled; execute the documented rollback drill only against controlled/authorized installations.

S37 requires this complete evidence set, finalized inventory and compatible release artifacts; partial metrics do not satisfy entry.
