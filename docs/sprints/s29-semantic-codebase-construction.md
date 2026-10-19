# Browser Agent S29 — Semantic Codebase construction and repository

**Status: Planned. Created: 2026-10-18. Implementation: not started.**

Owner: Knowledge-plane maintainer. Migration slice: M03. Prerequisites: [S28](s28-workspace-backend-bridge.md).

Design: [refactoring](../architecture/web-codebase-agent-refactoring.md), [construction](../architecture/web-codebase-construction.md), [runtime contracts](../architecture/web-codebase-runtime-contracts.md). Parent phase and metric definitions: [migration plan](../architecture/web-codebase-agent-migration-plan.md).

## Objective and entry boundary

Implement the explicit construction rules, provenance, finite scope and durable graph so the Codebase is more than a snapshot or successful-recipe cache.

All prerequisite runtime/evidence gates must pass before this Sprint is marked complete. Planning or read-only preparation does not satisfy a runtime dependency. Current behavior remains defined by implementation and dated evidence.

## Change boundary

Refactoring units: **RF10, RF12, RF13, RF20, RF22**. Current sources: [content/semantic-collector.ts](../../extension/src/content/semantic-collector.ts), [content/collection-discovery.ts](../../extension/src/content/collection-discovery.ts), [content/component-observation.ts](../../extension/src/content/component-observation.ts), [learned-profile/store.ts](../../extension/src/learned-profile/store.ts).

Planned destinations/deliverables: `packages/{collector,codebase-builder,codebase-schema,codebase-repository}/`; the construction specification owns proposed algorithms and defaults.

Preserve current Side Panel/Options/profile-manager presentation structure, explicit consent, Ask/Act boundaries, fresh target binding and dispatch uncertainty. Do not edit unrelated work, introduce an undeclared second executor, or claim external/OS/live success from fixtures.

## Implementation cards

All cards are Planned. Execute as reviewable changes with the listed regression checks; no product implementation is authorized merely by creating this Sprint.

| ID     | Change                                                                                                                                                                                                                                                                                        | Acceptance / linked checks                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S29-C1 | **Define graph and observation schemas.** Implement versioned entities/edges/evidence/datasets, ObservationBatch/BuildDelta, coverage and algorithm versions from the construction specification.                                                                                             | Closed validation rejects dangling/cross-partition references and live execution authority in persistent fields. Checks: S29-R01.                                     |
| S29-C2 | **Build bounded Level 1 traversal.** Replace unbounded discovery traversal with interruptible DOM walks and prioritized normalized output; apply sensitive exclusions before emission.                                                                                                        | 5,000 examined/1,000 emitted node limits and component/action/sample caps produce explicit partial coverage. Checks: S29-R02.                                         |
| S29-C3 | **Implement deterministic semantic structure.** Apply component priority/nesting, action-capability, parameter and schema/state rules; isolate optional JEV inferred annotations.                                                                                                             | Golden fixtures yield stable structure; unknown business effects/types stay unknown. JEV annotations remain disabled until S27 qualifies. Checks: S29-R03.            |
| S29-C4 | **Implement identity and deltas.** Add partition/page/entity identity reconciliation, versioned fingerprints, dirty-root coalescing, tombstones and dependent invalidation.                                                                                                                   | Duplicate names/ambiguous matches never share executable identity; page churn/limits terminate honestly. Checks: S29-R04.                                             |
| S29-C5 | **Implement transactional IndexedDB authority.** Add stores/indexes, CAS/idempotency, versioned snapshots, dataset chunks, pinning/eviction and backend projection API.                                                                                                                       | Concurrent/stale/conflicting writes cannot overwrite current facts; quota failures preserve committed data. Checks: S29-R05.                                          |
| S29-C6 | **Integrate read services and advisory imports.** Wire discovery/search/inspection/deterministic query data through ports and fixture callers; import learned/workflow metadata as advisory candidates with source history. Provider/MCP tool advertising waits for S30 registry integration. | No imported ref/grant/method handle is executable; static counts and dataset provenance agree. Checks: S29-R06.                                                       |
| S29-C7 | **Qualify construction and resource limits.** Create observation-to-graph goldens and actual Chrome first-visit/revisit/delta cases, including sample truncation and denied regions.                                                                                                          | All generation stages report examined/emitted/omitted counts, deadline and coverage; nothing labels capped data complete. Checks: S29-R02, S29-R04, S29-R05, S29-R06. |

## Verification scenarios

| ID      | Scenario                  | Expected evidence                                                                                                                                            |
| ------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S29-R01 | Schema and authority      | Invalid evidence status, unknown schema, cross-account edge and persisted live ref/token reject.                                                             |
| S29-R02 | Bounded extraction        | Large/nested DOM, sensitive input and wide tables hit exact configured limits with explicit omission/truncation; no blocking whole-document enumeration.     |
| S29-R03 | Structure and meaning     | Nested grid/form/wrapper/duplicate-name fixtures have correct boundaries; inferred JEV labels cannot replace observed kind/effect.                           |
| S29-R04 | Identity and invalidation | Account/query/route changes, repeated names, removed nodes and mutation storms invalidate only safe dependents and stop unstable pages.                      |
| S29-R05 | Repository atomicity      | Duplicate identical/conflicting batches, CAS races, interruption, quota/eviction and pinned evidence preserve atomicity and truthful resource errors.        |
| S29-R06 | Reuse and imports         | Revisit reuses structure with fresh bindings; static dataset identity/counts and imported advisory workflow history remain correct without stored authority. |

Card references R01–R06 correspond to the zero-padded scenario IDs in this table.

## Completion and evidence

Golden normalization/builder/repository tests, fake and real IndexedDB transaction tests, unit reader/query checks and controlled Chrome discovery/delta evidence.

Record results in a dated file under `docs/evidence/` named for S29; create it when checks actually run. Include source revision/dirty caveat, app/schema/model/client/OS versions, exact commands, first failures, recovery, approval and dispatch counts, coverage, terminal result and UI evidence where relevant.

Completion requires all S29-C cards and S29-R scenarios, passing applicable boundaries and a linked evidence record. Update this document, the Sprint index and progress ledger together. Until then keep status Planned or In Progress; documentation checks are not implementation evidence.

## Rollback and handoff

Use a separate target repository namespace; disable new graph reads without deleting source recipes or legacy storage. Imported data never activates old/new execution.

S30 consumes graph contracts; S32 adds advanced channels. Structural operation can pass independently, but JEV semantic annotation behavior requires S27 evidence.
