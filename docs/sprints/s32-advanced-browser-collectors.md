# Browser Agent S32 — Advanced collectors and data coverage

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Browser adapter maintainer. Migration slice: M06. Prerequisites: [S29](s29-semantic-codebase-construction.md), [S30](s30-shared-tool-policy-runtime.md), [S31](s31-durable-task-recovery.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Complete AX, MAIN, network, visual, navigation/frame and virtual-data capabilities under explicit budgets and provenance without widening execution authority.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF12–RF15**. Current sources: [cdp/bounded-adapter.ts](../../extension/src/cdp/bounded-adapter.ts), [content/component-alternative.ts](../../extension/src/content/component-alternative.ts), [service-worker/collection-read-orchestrator.ts](../../extension/src/service-worker/collection-read-orchestrator.ts), [service-worker/vision-capture.ts](../../extension/src/service-worker/vision-capture.ts).

Planned destinations/deliverables: Collector AX/network/MAIN/visual/navigation/frame modules, bounded CDP broker and advanced data-tool executors.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                                   | Acceptance / linked checks                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S32-C1 | **Create a shared bounded CDP broker.** Separate input versus AX/network/capture command capabilities, attachment ownership and cleanup/quarantine.                                      | Debugger conflict/denial never disables DOM reads or silently permits commands; unused owned sessions detach. Checks: S32-R01.                              |
| S32-C2 | **Implement frames, routes and incremental state.** Add permitted frame/open-shadow adapters, SPA/navigation events and scoped state deltas.                                             | Frame/depth/page budgets apply jointly; inaccessible/closed roots and unrelated navigation produce explicit gaps/invalidation. Checks: S32-R02.             |
| S32-C3 | **Add MAIN and network evidence.** Use registered bounded readers/static source rules, sanitized observed Fetch/XHR metadata and consented bounded responses.                            | Getters/arbitrary functions are not executed; source endpoint mentions differ from observed API; no request replay authority. Checks: S32-R03.              |
| S32-C4 | **Complete datasets and chart channels.** Implement virtual/paginated windows, deterministic accumulation/EOF checks, source-first charts and consented transient visual interpretation. | 10-second units, row/window/byte caps and restoration apply; duplicate text is not row identity; inferred visual data is labeled. Checks: S32-R04, S32-R05. |
| S32-C5 | **Connect advanced tools and Chrome evidence.** Advertise only qualified capabilities in the registry; record progress, omissions and read-only versus Act boundary cases.               | All reference collector types have actual runtime evidence or precise browser-access limitations; no generic unsupported stub passes. Checks: S32-R06.      |

## Verification scenarios

| ID      | Scenario                   | Expected evidence                                                                                                                                          |
| ------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S32-R01 | CDP ownership              | Another debugger, denied permission, abrupt detach and cleanup failure produce bounded unavailable/quarantine results without arbitrary command fallback.  |
| S32-R02 | Frame/SPA coverage         | Same/cross-origin frames, open/closed shadow, frame navigation and SPA changes preserve identity and explicit denied/excess gaps.                          |
| S32-R03 | Source/network privacy     | Malicious getters/scripts, sensitive headers/cookies, oversized bodies and endpoint timing correlations cannot leak secrets or enable API replay.          |
| S32-R04 | Virtual/paginated identity | Repeated text with different keys, recycled rows, missing keys/EOF and changing filter/totals never falsely report complete data.                          |
| S32-R05 | Limits/visuals             | Unit timeout, row/window/byte limits, failed scroll restore and denied/unmaskable screenshot show honest coverage/restoration and no coordinate authority. |
| S32-R06 | Advanced tool loop         | Real Chrome registry invocation returns actual AX/network/chart/table evidence with provenance, capability status and correct Ask/Act constraints.         |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Adapter/parser/coverage/broker tests plus controlled Chrome advanced fixture matrix; source/consent/timeout and existing S13/S19 regressions.

Record results in a dated file under `docs/evidence/` named for S32; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S32-C cards and S32-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Withdraw affected capability schemas and stop owned observers/attachments. Keep valid graph metadata with stale/unavailable status; never fall back to arbitrary JS or screenshot clicks.

S36 requires advanced capabilities in the full holdout/release set; they are not optional post-migration work.
