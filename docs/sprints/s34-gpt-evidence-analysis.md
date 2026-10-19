# Browser Agent S34 — GPT evidence analysis and provider-role migration

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Analysis/provider maintainer. Migration slice: M08. Prerequisites: [S33](s33-jev-task-orchestration.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Implement GPT as an evidence-bound analyst with no browser-control authority and adapt existing provider forms to the target roles without changing their structure.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF17, RF18, RF24, RF27**. Current sources: [providers/provider-request.ts](../../extension/src/providers/provider-request.ts), [providers/provider-response.ts](../../extension/src/providers/provider-response.ts), [settings/provider-state.ts](../../extension/src/settings/provider-state.ts), [settings/provider-secret-write.ts](../../extension/src/settings/provider-secret-write.ts).

Planned destinations/deliverables: `packages/analysis-engine/`, backend GPT Responses adapter and settings/secret services with preserved UI form bindings.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                         | Acceptance / linked checks                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| S34-C1 | **Migrate role/settings services.** Map candidate JEV to controller and compatible selected primary to analyst; retain disabled/incompatible records for repair/export.        | No auto-enabled JEV or inherited secret across changed provider boundary; former primary-fallback setting becomes safe stop. Checks: S34-R01. |
| S34-C2 | **Implement analyst data resolution and egress.** Resolve approved immutable dataset/query references, validate digests/partition/expiry and produce bounded sanitized inputs. | No full-cache upload, live locator, approval token, browser tool schema or secret enters the analyst request. Checks: S34-R02.                |
| S34-C3 | **Implement Responses analysis transport.** Port bounded request/response/stream/abort behavior to backend with pinned config/model and resource accounting.                   | Schema/timeout/cancellation failures preserve first failure; no analyst call can dispatch a browser action. Checks: S34-R03.                  |
| S34-C4 | **Validate findings and additional-data requests.** Enforce result schema, supporting evidence references, deterministic totals and limitations; route new-data needs to JEV.  | Invalid/unsupported findings are not published as accepted; extra data requires JEV/runtime scope and consent. Checks: S34-R04.               |
| S34-C5 | **Connect existing UI and live acceptance.** Display analyst progress in execution details and publish only accepted content; qualify actual Responses analysis.               | Basic search uses zero GPT calls; complex analysis is grounded and cannot become a hidden controller path. Checks: S34-R05, S34-R06.          |

## Verification scenarios

| ID      | Scenario                   | Expected evidence                                                                                                                                 |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| S34-R01 | Settings/secret conversion | v1/v2, invalid/disabled/non-GPT providers, blank secret write and endpoint change preserve data safely and never create readiness.                |
| S34-R02 | Dataset isolation          | Expired/changed/foreign-partition/unconsented refs and oversized data fail; sanitized authorized snapshots preserve exact lineage.                |
| S34-R03 | Provider failures          | Bad schema/stream, timeout/429, model/config change and cancellation cannot leak data, reset budgets or execute tools.                            |
| S34-R04 | Evidence support           | Dangling citation, contradictory total and unsupported causal claim reject; valid reference syntax alone is insufficient.                         |
| S34-R05 | Delegation/UI              | Additional data returns to JEV; two-call budget exhaustion reports limitations; one accepted final message appears through the existing UI.       |
| S34-R06 | Live analyst               | Pinned Responses model produces validated grounded findings on held-out datasets; search has zero analyst calls and GPT has zero browser schemas. |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Settings/secret/transport/analysis/evidence tests, controlled task integration, provider-call diagnostic regression and required live Responses semantic evidence.

Record results in a dated file under `docs/evidence/` named for S34; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S34-C cards and S34-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Disable analysis capability while preserving controller/runtime and provider records. Do not substitute GPT for JEV or replay page changes to regenerate an answer.

S35 exposes the same analysis operation externally; S36 qualifies joint JEV/GPT behavior and migration.
