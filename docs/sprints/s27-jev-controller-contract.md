# Browser Agent S27 — JEV controller protocol and feasibility

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Task Engine and JEV adapter maintainer. Migration slice: M01. Prerequisites: [S26](s26-migration-baseline.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Turn the current finite-decision JEV integration into a qualified controller decision port without delegating browser planning or executable arguments to GPT.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF03, RF04, RF16**. Current sources: [providers/jev-client.ts](../../extension/src/providers/jev-client.ts), [providers/jev-response.ts](../../extension/src/providers/jev-response.ts), [providers/decision-questions.ts](../../extension/src/providers/decision-questions.ts).

Planned destinations/deliverables: `packages/provider-adapters/src/jev/` and `packages/task-engine/src/decisions/`, candidate-set and argument-binding contracts.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                                                             | Acceptance / linked checks                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| S27-C1 | **Define closed controller frames.** Specify frame/candidate digests, template/model revisions and intent, sufficiency, semantic relation, next-tool, processor, recovery and acceptance questions.                | Answers bind to the exact current candidates; UNKNOWN/NEED_INPUT/UNSUPPORTED remain first-class; no invented tool-call conversation. Checks: S27-R01. |
| S27-C2 | **Build bounded candidates and value bindings.** Enumerate graph/registered primitive plan fragments; bind arguments to user spans, approved inputs, observed refs or registered transforms.                       | Search literal and timezone-qualified relative date examples resolve deterministically; ambiguous values wait for input. Checks: S27-R02.             |
| S27-C3 | **Extract native adapter and validation.** Reuse bounded native transport/parser logic behind ControllerPort; separate semantic decisions from effect/approval authority.                                          | Malformed/foreign choices, invalid probability distributions and wrong model/frame revisions cannot advance a task. Checks: S27-R03.                  |
| S27-C4 | **Implement controller budgets and failure outcomes.** Apply shared reservations, confidence/sufficiency gates, duplicate-state detection and explicit controller-unavailable outcomes.                            | No PRIMARY_LLM fallback or GPT-generated plan exists; retries consume the same counters and preserve first failure. Checks: S27-R04.                  |
| S27-C5 | **Qualify the request envelope.** Use synthetic graph fixtures then a live pinned JEV service for Ask aggregation, EQP001 search and complex-analysis delegation; include Korean/English and reordered candidates. | Semantic choices/arguments are valid with zero GPT controller calls. A failed feasibility gate blocks S33 completion. Checks: S27-R05, S27-R06.       |

## Verification scenarios

| ID      | Scenario                  | Expected evidence                                                                                                                                |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| S27-R01 | Frame integrity           | Wrong candidate digest, unknown selection, old plan revision and mismatched response model fail closed.                                          |
| S27-R02 | Parameter provenance      | Exact literal, approved slot and timezone transform pass; invented ID, ambiguous date, secret value and stale observed option reject or clarify. |
| S27-R03 | Native validation         | Missing/extra answers, invalid distribution, low confidence and incomplete state preserve UNKNOWN without dispatch.                              |
| S27-R04 | Role and budget isolation | Missing/disabled JEV, timeout/429 and repeated no-progress frames never contact GPT for control; counters and first failure remain recorded.     |
| S27-R05 | Scenario semantics        | For all three reference scenarios, inspect selected fragments, data sufficiency and argument sources; direct search uses zero GPT calls.         |
| S27-R06 | Live qualification        | Record pinned JEV/model/protocol and actual semantic choices on held-out Korean/English requests; HTTP success alone cannot pass.                |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Native adapter/contract/binder tests, package typecheck and import boundaries; controlled scenario evaluation and required live JEV feasibility evidence.

Record results in a dated file under `docs/evidence/` named for S27; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S27-C cards and S27-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Keep target routing unavailable; existing production behavior is untouched until later cutover. Do not activate a primary fallback to make feasibility appear successful.

S29 can build deterministic graph rules independently; semantic annotation activation and S33 require this qualified protocol.
