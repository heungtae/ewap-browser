# Semantic Codebase construction specification

Status: **Planned — design only.** Date: 2026-10-18.
Parent: [detailed refactoring](web-codebase-agent-refactoring.md). Delivery: S27, S29, S32, S33 and S36.

This document specifies who builds the Codebase, how observations become entities and relationships, how much is collected, and when work stops. It completes the qualitative Level 1/2/3 design in [the architecture](web-codebase-agent-migration.md). All numeric values below are selected **initial target configuration**, to implement and qualify; they are not measurements or existing behavior claims.

## 1. Ownership and triggers

| Stage                       | Owner / process                                  | Decision and output                                                                                                                                 |
| --------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task admission              | Task Engine / backend                            | Establish user mode, site/tab scope, permission and shared budgets.                                                                                 |
| Initial discovery           | Collector / extension                            | Automatically run bounded Level 1 for the admitted current page when there is no fresh usable catalog. No model needed.                             |
| Observation normalization   | Collector / extension                            | Sanitize and emit immutable, frame/document-bound observations and coverage metadata.                                                               |
| Structural graph generation | Codebase Builder / extension                     | Apply deterministic rules to create components, controls, data schemas, relation candidates and state facts. No model/network/execution dependency. |
| Optional semantic selection | JEV / backend through Task Engine                | Select among existing bounded meanings/relationships, with evidence sufficiency; results remain inferred. No free-text domain schema generation.    |
| Fact/predicate verification | Runtime verifiers / extension or pure query code | Verify only the stated predicate against fresh evidence; cannot promote unrelated claims.                                                           |
| Graph persistence           | Repository service / extension                   | Sole graph writer: validate, compare expected revision, commit entity/edge/evidence delta atomically.                                               |
| Deep inspection             | JEV selects; Collector executes                  | Investigate a task-relevant component/resource under the same budgets and consent.                                                                  |
| Incremental refresh         | Browser event collector / extension              | Observe changes within the admitted scope, refresh affected facts and mark dependent knowledge stale.                                               |
| Data analysis               | GPT / backend                                    | Analyze immutable dataset references through `analysis.run`; no graph writes or browser action selection.                                           |

Discovery starts on an admitted request, an explicit existing rediscover operation, or an expected navigation within an active task. Merely installing the extension or visiting unrelated sites does not start a crawler. When no task is active, event listeners may mark a cached page stale using safe lifecycle metadata; they do not capture page bodies or run models.

The working domain is the current page and explicitly authorized pages reached by the task. Discovered links become route candidates, not an automatic crawl queue. Background/bulk site indexing is outside the initial product contract and cannot be enabled implicitly by these Sprints.

## 2. Observation and build contracts

Proposed `ObservationBatch` fields:

| Field group | Required meaning                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Identity    | `batchId`, task ID, partition ID, tab/frame/document/route epochs, collector kind/version                                               |
| Revisions   | observed source revision, expected graph revision, monotonic observation sequence, timestamp                                            |
| Scope       | root entity or page, traversal mode, requested fields, effective permissions and budget revision                                        |
| Facts       | bounded sanitized typed records; each has a source location/evidence ID, never a live executable reference in a persisted field         |
| Coverage    | examined/emitted counts, known/unknown totals, omitted fields/ranges, termination reasons, `complete/partial/viewport_only/unavailable` |
| Integrity   | sanitized payload digest, byte count, redaction count, cancellation generation                                                          |

`BuildDelta` contains upserts, edge changes, evidence additions, invalidations/tombstones, expected revision, idempotency key and coverage. Builder output is deterministic for the same sanitized batch, existing entity index and algorithm version. The repository rejects cross-partition edges, dangling references, duplicate IDs with conflicting contents, stale source epochs and unexpected revisions.

Graph search returns stable semantic IDs plus revision/status/coverage. Tool execution asks the browser to resolve a separate **ephemeral binding**; persisted entities never contain DOM refs, CDP node IDs, approval tokens, function handles or input values. A semantic locator describes how to find a candidate and is not an execution grant.

## 3. Level 1: structure and catalog algorithm

### 3.1 Walk and normalize

1. Freeze the page/frame epoch and scope. Apply sensitive-field/page exclusions before producing any record. Use an interruptible walker; avoid unbounded `querySelectorAll` followed by truncation.
2. Traverse the selected DOM scope in deterministic document order with work/time limits. Open shadow roots and permitted frames use explicit adapters and contribute to shared budgets. Inaccessible roots are coverage gaps.
3. Normalize names with Unicode NFC, whitespace collapsing and bounded text length. Preserve original sanitized evidence separately so normalization is auditable. Numeric strings/units are not coerced into a domain value without a declared parser.
4. Emit roles, accessible names, safe attributes, visibility, enabled/editable/checked/selected state, structural parent/label relationships and declared links. Hidden content permitted by read scope is separately labeled and never becomes an actionable target.
5. Allocate output budget in this order: page/route/frame identity, component descriptors, current control capabilities, data headers/sample metadata, relevant text. Each omission contributes to coverage; exceeding a cap cannot yield `complete`.

### 3.2 Component boundaries

Rules run in priority order. A component has a root evidence ID, kind, reason and structural parent. A nested recognized component stays a child rather than having its rows/controls flattened into the parent.

| Priority | Observation                                                        | Component / relationship rule                                                                                                             |
| -------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Native or explicit ARIA `table`, `grid`, `tree`, `list`, `listbox` | Create typed data component; attach only rows whose nearest corresponding component ancestor is this root.                                |
| 2        | `form`, `dialog`, `tabpanel`, fieldset/group with explicit label   | Create container component; attach controls by actual containment or explicit `form` ownership.                                           |
| 3        | `figure`, accessible graphic/image, SVG, canvas                    | Create visual component; connect explicit caption/description/alternative table evidence. Canvas alone proves no underlying numeric data. |
| 4        | Named region/landmark with controls or data children               | Create region component, excluding redundant wrappers with identical child membership and no independent name/state.                      |
| 5        | Uncontained actionable control or collection                       | Create a bounded singleton/unclassified component; do not invent a business module name.                                                  |

Component names use explicit label/accessible name first, associated heading/caption second, and a fixed role-based placeholder last. A placeholder is not inferred domain meaning. Duplicate names remain distinct. A component can be structurally recognized while its business role is unknown.

### 3.3 Actions, parameters and effects

For each visible, enabled control, generate only capabilities supported by its concrete runtime adapter and verifier. Examples: button/link activation → `web.click`/`web.navigate`; editable non-sensitive text → `web.fill`; select/radio/checkbox → `web.select`. Store required mode/permissions, effect knowledge, preconditions, parameter schema and verifier ID.

Input constraints come from observed type/required/min/max/step/pattern/options and registered schemas. User values are task arguments and never stored in the reusable Action. Do not interpret a button labeled “Save” as proof of persistence or an input's `change` handler as read-only.

Effects have two dimensions: mechanism (`read`, `navigate`, `edit_control`, `invoke_registered`) and business effect (`read_only`, `unsubmitted`, `write`, `destructive`, `external_transfer`, `unknown`). Automatic Act input requires a supported non-sensitive control and evidence that the intended operation fits policy. Unknown autosave/submit effects cannot inherit the low-risk default. Unsupported verifier or ambiguous effect produces a non-executable candidate with a reason.

### 3.4 Data and state

Generate `DataEntity`/schema candidates from table headers, fields, accessible chart labels and registered response schemas. Mixed or insufficient samples keep `unknown`/union field types. Required fields, uniqueness, totals and units must be observed or explicitly declared by a validated adapter, never guessed from five sample rows.

Level 1 stores descriptors and small samples only. Full collection is Level 2. State facts include current filter/selection/sort/page/loading indicators, with sensitive values removed. Record a transition after a task action only if before/after scopes and receipts match. Mere temporal coincidence produces an inferred relationship, not verified causality.

## 4. Meaning, relationships and JEV's role

Structural relations such as containment, label ownership, form membership and discovered navigation come directly from DOM/AX observations. Business relations follow this hierarchy:

1. **Registered relation:** a reviewed/versioned adapter declares an action-to-data or endpoint-to-component mapping, verified against the current adapter and page prerequisites.
2. **Explicit page relation:** DOM/ARIA/form/link evidence identifies a relationship; its exact assertion is observed, while a broader business interpretation can remain unknown.
3. **Observed transition:** a permitted action receipt plus before/after observations supports a particular state change. Store time window, competing changes and verifier scope.
4. **Candidate relation:** proximity, shared labels, script metadata or request timing suggests a relationship. Persist it as inferred with evidence references; do not make it an executable API route.

Task Engine may ask JEV to select `SEARCH_FORM`, `FILTER_CONTROL`, `RESULT_COLLECTION`, `DETAIL_REGION`, `UNRELATED`, or `UNKNOWN` from candidate meanings supported by the collected facts. A second closed question can select among enumerated relation candidates. Initial selection gates are choice confidence ≥0.9, selected-option probability ≥0.9, and evidence sufficiency ≥0.9; these are calibration defaults, not authority guarantees. Low confidence returns `UNKNOWN` and requests inspection/clarification within budget. Candidate order is stable and tested with permutations.

Task Engine sends the accepted typed decision through the dedicated `codebase.proposeAnnotation` command. The extension checks the issued candidate-set digest, task/cancellation generation, current graph/source revisions and permitted annotation vocabulary. Builder then produces an **inferred annotation** delta for the repository transaction; the backend cannot submit arbitrary entity/edge mutations. Neither confidence nor JEV acceptance upgrades an API, locator or effect to executable. Verification requires a named deterministic/adapter predicate on current evidence. The graph retains separate structural type and semantic annotation so a mistaken semantic label cannot corrupt an observed table into a form.

There is no GPT-driven schema writer. If future work requires open-ended domain concepts beyond this finite vocabulary, it needs a separately reviewed annotation contract and eval; it cannot quietly enter via `analysis.run`. The initial envelope covers discovered UI operations, tabular queries and reference alarm/search scenarios. Requests that require unsupported semantic invention must report the gap.

Script inspection reads bounded source slices and derives static references only through registered parsers/rules. It does not execute source, traverse arbitrary getters or claim to recover hidden server code. API candidates from source differ from `ObservedApi` entries actually seen on the network. Network timing alone never grants permission to call an endpoint.

## 5. Identity, matching and invalidation

`partitionId` binds local profile, origin and a privacy-preserving account-context guard. Unknown account context prevents persistent reuse of personalized data. `pageKey` uses a reviewed route template when present; otherwise a hashed exact canonical URL/context including relevant query state. Strip secrets from display fields, and do not merge routes by removing all query parameters.

Allocate opaque entity IDs on first observation. Reconcile using, in order: validated adapter stable ID; unique safe stable attribute under the same parent; unique role/name/kind/ancestor/label relation tuple with matching structural fingerprint. Never use DOM position alone to claim stable semantic identity. Ambiguous matches invalidate the old actionable mapping and allocate distinct candidates; an LLM cannot break an execution identity tie.

Fingerprint structure and dynamic state separately with algorithm versions. A new data row count need not replace the whole component; a changed form/control capability invalidates dependent Action bindings. Removed entities get tombstones and dependent records become stale. Invalidated graph facts remain history but are excluded from executable candidate queries.

Incremental refresh coalesces events for 250 ms and flushes within 1 second while active. Reinspect dirty component roots. If the root changed, more than 20% of indexed components are dirty, or 128 dirty roots accumulate, perform one bounded Level 1 refresh instead. Permit at most two full rediscoveries per page per task; further churn returns `PAGE_UNSTABLE`/partial coverage and suspends mutation. Cancellation or document change discards late deltas.

## 6. Level 2: task-directed inspection and extraction

JEV receives compact graph candidates and coverage gaps, then chooses a component/resource and requested information. Every deep read names its need: missing parameter options, unclear target, schema/coverage, postcondition, API evidence, or analysis dataset. A repeated identical inspection with no new evidence does not get a fresh budget.

The reader order is accessible DOM/data → explicit alternative table/description → registered read adapter/previously observed permitted response → bounded scroll/pagination → consented visual interpretation. Selection depends on capability and evidence, not a guessed widget kind. Read-only Ask cannot operate date/filter controls to acquire a different dataset; request Act through the existing mode interaction if needed.

Each collection window records row identity, cursor, scope, filters, counts and EOF evidence. Deduplicate by validated row key or stable scoped row index, never by text equality. Identical-valued rows may be distinct. Missing stable identity across virtual windows prevents a complete-coverage claim. Pagination that navigates or changes application state is an Act operation unless a reviewed adapter proves a permitted read channel.

Completeness requires stable scope, no omitted required fields/cells, identity-safe accumulation, explicit EOF/range evidence and consistency with any observed total. Unknown total remains unknown. A visual estimate, maximum row count, repeated last window or timeout does not prove EOF. Dataset digest covers schema, scope, ordered rows, provenance and coverage, not just values.

## 7. Initial resource budgets

Configuration is versioned as proposed `construction-v1` and `task-budget-v1`, pinned at task admission. The effective limit is the minimum of deployment policy, task profile, operation cap and remaining parent budget. A model cannot raise it. A broader user-requested scope is admitted as a new reviewed task profile; retry/navigation/reconnect do not reset consumed counters.

| Budget                                              | Initial value                                                                                      | Limit behavior                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Level 1 start scope                                 | One current page; no recursive link crawl                                                          | Persist outgoing links as candidates only.                                                                         |
| DOM nodes examined / semantic nodes emitted         | 5,000 / 1,000 per page discovery                                                                   | Stop bounded walker; mark omitted traversal partial.                                                               |
| Components / Actions / outgoing route candidates    | 128 / 256 / 128 per page                                                                           | Deterministic prioritization, counts and omitted IDs/ranges when known.                                            |
| Frame count / frame depth                           | 8 / 4 per task target page, shared page budgets                                                    | Unsupported/denied/excess frames contribute explicit gaps.                                                         |
| Collection sample                                   | 5 rows × 20 cells; 200 characters per sample cell                                                  | Sample-only marker; truncation never defines full schema/coverage.                                                 |
| Normalized observation batch                        | 256 KiB UTF-8                                                                                      | Split under one bounded operation; omitted content marked, not silently dropped.                                   |
| Collection unit deadline                            | 10 seconds active time per component/window/resource operation                                     | `UNIT_TIMEOUT`, keep validated partial data and progress; parent clock still applies.                              |
| Browser collector units                             | 64 per task; at most 2 independent reads concurrently                                              | Cancel queued excess; a mutation is exclusive per tab.                                                             |
| Deep targets                                        | 16 distinct components/resources per task                                                          | `NEED_NARROWER_SCOPE`; no automatic site scan.                                                                     |
| Pages visited / navigation depth                    | 8 distinct pages / 3 edges from admitted start                                                     | Stop new navigation; scope expansion requires a new admitted request.                                              |
| Table extraction                                    | 200 rows/window, 50 windows, 10,000 rows/dataset                                                   | First reached cap terminates partial unless independent EOF was already proved.                                    |
| Fields and cells                                    | 50 columns, 4,096 characters per stored cell                                                       | Mark omitted columns/truncated cells; cannot claim complete requested data.                                        |
| Dataset / task data bytes                           | 8 MiB / 16 MiB sanitized UTF-8                                                                     | Preserve coverage and reason; no unsolicited larger model payload.                                                 |
| Script deep read                                    | 4 resources/task; 256 KiB/resource; 1 MiB/task                                                     | Permission and source-revision checks; larger scripts use bounded slices, never execution.                         |
| Network observation                                 | 100 metadata records/task; 30-second window inside task scope                                      | Stop listener and detach owned CDP when budget expires.                                                            |
| Permitted network response body                     | 256 KiB sanitized/response, within 8 MiB dataset limit                                             | Oversized/inaccessible bodies yield metadata only and a gap; never retain authentication fields.                   |
| Screenshots                                         | 2/task, 2 MiB each, transient only                                                                 | Consent and masking; reject if masking cannot be established.                                                      |
| JEV frame                                           | 32 candidates, 16 questions, 32 KiB sanitized state                                                | Page/select bounded groups; no hidden omission presented as sufficient.                                            |
| JEV calls / model time                              | 24/task; 10 seconds/call                                                                           | Stop/review on exhausted budget; no GPT controller fallback.                                                       |
| Tool invocations / mutation steps                   | 64 / 12 per task                                                                                   | Child collectors consume their own shared counters; nested workflows do not reset limits.                          |
| GPT calls                                           | 2/task including an additional-data follow-up                                                      | Evidence insufficiency after the budget becomes an explicit limitation.                                            |
| Model token reservations                            | JEV 48k input/4k output total; GPT 48k input/8k output total                                       | Reserve before sending; reconcile reported usage; no call if remaining budget cannot cover it.                     |
| GPT request content                                 | 64 KiB sanitized data text plus bounded schema; output ≤8 KiB text-equivalent before UI projection | Larger datasets use deterministic aggregates/selected evidence with coverage; never silently send the whole cache. |
| Task active / overall elapsed time                  | 180 seconds / 600 seconds                                                                          | Active excludes user waits; overall includes them and restart downtime.                                            |
| User approval/input wait                            | 300 seconds, clipped to remaining overall deadline                                                 | Expire prompt; old response cannot resume authority.                                                               |
| Repeated no-progress decision / pre-dispatch replan | 2 equivalent decisions / 1 recovery replan per failed step                                         | Clarify or stop; no post-dispatch mutation retry.                                                                  |
| Cache / dataset TTL / structure TTL                 | 100 MiB per profile / 24 hours / 30 days                                                           | Pin live evidence; prune expired then LRU unpinned records; fail explicitly if pinned data fills capacity.         |

Byte caps apply before expensive parsing and at transport/egress boundaries. Token reservations use the selected model's qualified estimator; if unavailable, use a conservative byte-based upper bound rather than assuming a favorable characters/token ratio. HTTP/model retries count against calls, time and tokens. If price metadata is configured, the task can also impose a monetary ceiling; no invented current pricing is stored in this design.

Screenshots are separate transient buffers, not retained Codebase dataset blobs. Network and screenshot consent is not implied by the 100 MiB cache budget. Cache usage includes indexes/evidence/version metadata; record measured physical storage overhead and start eviction below the cap. Persistent task/dispatch audit retention is separate from disposable graph-data TTL and defined in the runtime contract.

## 8. Repository commit and reuse

Proposed IndexedDB stores: `partitions`, `pages`, `entities`, `edges`, `evidence`, `datasets`, `datasetChunks`, `versions`, `tombstones`, `dispatchLedger`, `migrationJournal`. Index entity kind/page/parent/normalized-name/capability/status and evidence source/time. Queries require a partition and bounded result limit; do not expose arbitrary SQL or raw key scans to a model.

Within one write transaction: verify source epoch/revision and idempotency key → validate delta/links → allocate or reconcile IDs → write facts/evidence/invalidations/indexes → increment graph revision → append a change record. Return committed revision and digest. Duplicate batch IDs with identical digests return the same result; conflicting duplicates reject. CAS conflict may rebuild once from a newer index within budget; it cannot overwrite newer facts.

Backend receives only requested graph projections and authorized dataset snapshots tagged with repository identity, partition, revision and digest. A graph query that requires fresh state cannot be satisfied from a stale backend projection. Deletion/account changes invalidate projection leases and analysis references. Task-active pinning lasts only until terminal handling or the overall deadline, not indefinitely after a lost client.

On revisit, compare privacy partition, route context and fresh structural discovery before reusing action recipes. Reuse structure where uniquely matched; always refresh execution bindings and task-relevant values. Old successful workflows are advisory templates. Their historical evidence can explain a method but cannot establish today's page result.

## 9. Worked build and acceptance cases

For “Search EQP001,” Level 1 observes a labeled text field, Search button and results grid. Builder records three observed components/controls, `fill` and `click` capability candidates, grid schema and containment. If their interaction is not registered/explicit, `search-controls → results-grid` remains inferred. JEV selects the supported search candidate; the binder references the user's literal `EQP001`. Runtime obtains necessary authority, executes once and verifies current filter/result evidence. Only that particular verified transition is added; no global claim about all future searches is made.

For alarm analysis, JEV chooses the relevant grid and date context. A task requiring a changed date filter needs Act. Extraction records coverage and timezone. `web.query` computes exact supported aggregates. GPT sees the authorized immutable dataset/aggregate references. Incomplete rows or unobserved causes remain limitations. GPT findings do not rewrite graph truth.

| Case                                                  | Required result / owning Sprint                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| Nested grids, duplicate headings, wrapper-heavy DOM   | Stable separate boundaries; no flattened duplicate rows; S29                   |
| Hidden/sensitive controls and read-scope variants     | Correct visibility/omission; no executable hidden target; S29/S30              |
| Account change, query-dependent route, repeated names | No cross-context entity reuse or ambiguous ID merge; S29                       |
| Five-row sample with mixed types                      | Honest candidate schema, no invented required fields/total; S29                |
| Label suggests save but effect unknown                | Non-automatic unknown-effect action; S30                                       |
| JEV chooses unsupported meaning or stale relation     | Reject annotation; observed structure intact; S27/S29                          |
| Virtual rows with identical text and different IDs    | Distinct records retained; unstable identity stays partial; S32                |
| Network correlation / script mentions endpoint        | Inferred relationship or source candidate; no API replay grant; S32            |
| Continuous mutations, limit/timeout, denied frame     | Bounded termination with explicit partial coverage; S29/S32                    |
| Concurrent commits, duplicate batches, quota failure  | CAS/idempotency/atomicity and truthful errors; S29                             |
| Complete unchanged revisit versus changed component   | Reuse measured against baseline; local invalidation, fresh action binding; S36 |

S29 must provide golden observation-to-graph fixtures and S32 must provide actual Chrome collector evidence. S36 measures the architecture's detection, execution, Ask/Act, rediscovery and evidence-quality targets against a frozen holdout corpus. This design does not assert those targets are already achieved.
