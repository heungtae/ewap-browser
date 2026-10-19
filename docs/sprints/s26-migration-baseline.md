# Browser Agent S26 — Migration baseline and preservation inventory

**Status: Completed — baseline characterization, 2026-10-19. Created: 2026-10-18.**

Owner: Migration maintainer. Migration slice: M00. Prerequisites: None.

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Establish the exact source, UI, storage and regression baseline from which every internal responsibility can be migrated without losing behavior or unrelated work.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF01–RF30**. Current sources: [service-worker/runtime-chat.ts](../../extension/src/service-worker/runtime-chat.ts), [sidepanel/entry.ts](../../extension/src/sidepanel/entry.ts), [content/entry.ts](../../extension/src/content/entry.ts).

Planned destinations/deliverables: A per-file disposition manifest, UI baselines, regression corpus and release/consumer inventory. No new production runtime is required in this Sprint.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

The cards retain their original design and acceptance criteria. S26 implementation records are linked below; no production runtime change was made.

| ID     | Change                                                                                                                                                                                                                        | Acceptance / linked checks                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S26-C1 | **Freeze the implementation baseline.** Record HEAD, dirty files, package/manifest versions and source/config/artifact hashes. Reconcile the design baseline with changes made before implementation.                         | Every current source/helper/test/asset/config file has an RF owner, target disposition and owning Sprint; no unknown exclusions. Checks: S26-R01.        |
| S26-C2 | **Capture the existing presentation.** Record Side Panel, Options, all approval/value/consent states, profile manager, workflow preview, diagnostics and keyboard/window interactions at fixed Chrome viewport/font settings. | Expected structure and permitted role/help wording changes are separated; screenshots and interaction assertions are reviewable. Checks: S26-R02.        |
| S26-C3 | **Characterize public behavior.** Build fixtures for Ask/Act routing, no-op, stale target, verified action versus goal, collection coverage, current cancellation and provider errors.                                        | Baseline failures are labeled, first-failure evidence preserved and related issue IDs mapped to future regression owners. Checks: S26-R03.               |
| S26-C4 | **Inventory data and external consumers.** Enumerate storage keys/versions, native registration, profile/workflow/PDP/audit/Business MCP/Studio consumers and deployment platforms.                                           | Each record/consumer has a convert, archive, adapter or retire decision; no credentials or raw diagnostics enter the manifest. Checks: S26-R04, S26-R05. |
| S26-C5 | **Freeze qualification and retirement criteria.** Version holdout cases and metric denominators; inventory legacy messages/executors and the allowed temporary adapters.                                                      | Later Sprints have measurable entry/exit gates and deletion checks; design does not close existing issues or runtime work. Checks: S26-R06.              |

## Verification scenarios

| ID      | Scenario               | Expected evidence                                                                                                                             |
| ------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| S26-R01 | Inventory completeness | Add a fixture source/config file with no disposition and require inventory validation to fail; aliases cannot hide an owner.                  |
| S26-R02 | Presentation baseline  | Capture the same fixed viewport twice and confirm stable DOM/focus/layout comparison; intentional semantic text is separately listed.         |
| S26-R03 | Behavior baseline      | Exercise no-op, stale target, partial table and action-verified/goal-unknown examples; classify failures without rewriting expected outcomes. |
| S26-R04 | Storage catalog        | Enumerate v1/v2, malformed and disabled settings/recipe records; preserve counts and secret-free source digests.                              |
| S26-R05 | Consumer catalog       | Demonstrate each current external/native/workflow route has a caller or documented retirement check; unknown compatibility remains explicit.  |
| S26-R06 | Evidence scope         | Reject a fixture-only result as evidence for live JEV/MCP/OS install qualification; freeze corpus before tuning.                              |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Existing focused unit/fixture suites and controlled Chrome characterization; source and storage inventory coverage; documentation links. No version-changing build for baseline capture.

Record results in a dated file under `docs/evidence/` named for S26; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S26-C cards and S26-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

This Sprint changes characterization/inventory only. Restore fixture/manifest changes without modifying product data or replaying actions.

S27 and S28 may start after the baseline and preservation inventory are accepted.

## Delivered baseline — 2026-10-19

C1–C5 and R01–R06 characterization are delivered in the
[dated evidence](../evidence/s26-migration-baseline-2026-10-19.md) and
[frozen inventory](../baselines/s26/README.md). Exact paths, source/artifact hashes,
storage/consumer/legacy-message decisions, 26 accepted UI captures and immutable
qualification definitions are reviewable. Unowned physical source/config files
are rejected; fixture evidence cannot qualify a live provider, MCP or OS install.

Full unit 993/993, fixture 1/1, E2E 1/1, storage 3/3, type/lint/module boundaries,
controlled S24 management/window and S25 Ask/Act checks passed. Existing 88
oversized files and the legacy diagnostics ZIP endpoint assertion are recorded
as baseline failures with future RF owners. Their assertions and product code
were preserved. This completion records the baseline; it does not resolve those
failures, existing issues or S36 release qualification. Architecture, construction
and runtime-contract designs are byte-for-byte unchanged from implementation entry.
