# Web Codebase Agent runtime contract design

Status: **Planned — design only.** Date: 2026-10-18.
Parent: [detailed refactoring](web-codebase-agent-refactoring.md). Resource defaults: [construction specification](web-codebase-construction.md#7-initial-resource-budgets). No executable schemas or code are created by this document.

## 1. Schema ownership and versioning

Use closed discriminated contracts. One Zod definition owns each runtime shape and its JSON Schema export; compare golden accepted/rejected payloads in CI. Unknown mandatory fields, wrong discriminators and incompatible major versions fail before state changes. Optional compatible additions require an explicit capability/version handshake; do not strip fields silently to force compatibility.

| Namespace         | Package owner                         | Main contracts                                                        |
| ----------------- | ------------------------------------- | --------------------------------------------------------------------- |
| `wca.bridge/v1`   | `shared`                              | Session, command, response, ordered event and capability negotiation  |
| `wca.task/v1`     | `shared` / task-engine public exports | Admission, task snapshot, decision, prompt, plan and terminal result  |
| `wca.codebase/v1` | `codebase-schema`                     | ObservationBatch, BuildDelta, entities/edges/evidence/datasets        |
| `wca.tool/v1`     | `tool-registry`                       | ToolDefinition, PreparedStep, ToolResult and capability snapshot      |
| `wca.policy/v1`   | `policy-engine`                       | PolicySnapshot, ApprovalRequest, ApprovalReceipt and disclosure scope |
| `wca.analysis/v1` | `analysis-engine`                     | AnalysisRequest, AnalysisResult, AdditionalDataRequest                |
| `wca.release/v1`  | deployment/shared                     | Compatible artifact/protocol/schema ranges and digests                |

These are new internal namespaces. They do not claim compatibility with Browser `schema_version: 1`, Workspace `ewap/v1` or Platform envelopes. Legacy import and UI projection adapters name both schemas and validate both sides. External signed payloads are verified in their original encoding before projection.

## 2. Bridge and admission protocol

`BridgeEnvelope` requires protocol major/minor, kind, message ID, authenticated connection ID/epoch, paired installation/profile identity, sender role, sent time, deadline and payload digest. Task-bound messages additionally require task ID, runtime epoch and cancellation generation. Payload has the exact schema for `kind`. The bridge injects authenticated identity; payload identity cannot override the authenticated connection.

Allowed principal roles are `extension`, `agent`, and registered `mcp-client`. Content/page and model output never count as a principal. Native Messaging allowed origins and per-user socket/pipe ACLs establish the transport boundary; handshake challenges bind an installation/profile to a session. Registration/credential files must be protected by OS access controls, not merely predictable paths. Different Chrome profiles have separate pairing credentials and database/IPC namespaces.

Proposed command groups:

| Group      | Commands                                                                                                           | Authority rule                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session    | `hello`, `capabilities`, `heartbeat`, `resumeEvents`                                                               | Bootstrap only; no execution before identity/version negotiation.                                                                                                 |
| Task       | `task.start`, `task.status`, `task.cancel`, `task.answerPrompt`                                                    | Authenticated owner/scope; server assigns durable IDs and revisions.                                                                                              |
| Browser    | `browser.discover`, `browser.inspect`, `browser.prepare`, `browser.dispatch`, `browser.receipt`, `browser.cancel`  | Backend request plus browser-side final policy/binding checks.                                                                                                    |
| Knowledge  | `codebase.search`, `codebase.read`, `codebase.resolveDataset`, `codebase.proposeAnnotation`, `codebase.invalidate` | Authorized partition/revision; annotation accepts only a bound controller decision over issued candidates. No arbitrary fact writes or model/MCP write authority. |
| Management | `settings.*`, `workflow.manage`, `diagnostics.export`                                                              | Trusted extension UI or explicitly scoped local administrative command.                                                                                           |

Native frames are bounded to 256 KiB serialized UTF-8 in both directions as an initial conservative application limit. Large permitted payloads use transfer ID, chunk index/count, total length and final digest; at most four chunks await ACK. A chunk transfer is not exempt from operation/task byte/time caps. Reject duplicate conflicting chunks, missing completion, expired transfer IDs and reordered commands that require a prior state.

Task admission sequence: validate caller/mode/request → snapshot runtime/policy/model/budget revisions → reserve task/idempotency key → commit `TaskAccepted` in SQLite → return ACK → begin work. Repeating the same request ID and canonical request digest returns the same task. Same ID with different owner/mode/prompt digest returns `REQUEST_ID_CONFLICT`. Never start a second task because an ACK was lost.

Backend events have a per-task increasing sequence and committed task revision. Reconnect supplies `afterSequence`; return retained events or a snapshot with an explicit resync cursor. Presentation deduplicates by task/event sequence. Heartbeats convey connectivity only, not progress or success. Browser-unavailable tasks suspend within overall deadlines; native port reconnect does not restore old target authority.

## 3. JEV decisions, plans and parameter sources

`DecisionFrame` contains task/plan revision, phase, question-template version, source graph/evidence revisions, candidate-set ID/digest, finite candidates, budgets and safe current facts. `DecisionResult` binds the native model/version, answers/usage and original frame digest. There is no fabricated conversational tool-call ID for a native JEV response.

Required decision families: intent, evidence sufficiency, semantic candidate selection, next tool/plan fragment, processor (`RUNTIME`/`GPT_ANALYSIS`), recovery and result acceptance. `UNKNOWN`, `NEED_INPUT` and `UNSUPPORTED` are valid outcomes. The initial probability gates and limits are defined in construction configuration and calibrated in S27. Native answer-shape validation does not establish semantic correctness.

Candidate generation first intersects mode, site/tab scope, current capabilities, effect policy and parameter availability. Rank surviving candidates by explicit user-mentioned entity/field matches, registered workflow match and evidence freshness, with a stable semantic-ID tie-breaker. Names/proximity can rank investigation candidates but cannot resolve target uniqueness. A frame has at most 28 domain candidates plus four control outcomes (inspect more, request input, unsupported, unknown). Include total eligible/omitted counts and a revision-bound continuation cursor. Inspect-more can request the next bounded group or a narrower graph search; omission never becomes evidence that no matching action exists. Selection of an action with unresolved parameters returns input/inspection work, not invented argument values.

`PlanRevision` holds ordered steps/dependencies, goal predicates, allowed origins/tab scope, source candidate/evidence IDs, unresolved inputs and budget reservations. A material target/effect/parameter/scope change increments revision and invalidates affected approvals. A cosmetic explanation cannot change an executable plan. JEV selects among supplied fragments; the runtime verifies they are compatible and cannot create a cycle/unbounded loop.

`ArgumentBinding` allows only:

- `user_span`: exact span in the current request, with normalized value and span digest.
- `approved_input`: value supplied to a bound trusted UI prompt in the same task.
- `observed_value`: authorized current dataset/field/option reference with revision.
- `derived_value`: a registered deterministic transform over those sources, including timezone-qualified relative dates or exact aggregate calculations.

The binder preserves types/units and rejects absent, conflicting, stale or secret values. Do not ask JEV to emit new arbitrary arguments or use GPT prose as an executable value. “Yesterday” binds to the task's admitted timezone and date boundary; missing timezone requires a known explicit setting or clarification. Candidate generation must expose missing argument slots before execution.

## 4. Tool contracts and closed inputs

Every call has a runtime-issued `toolCallId`, tool/version, task/plan revision, schema/capability snapshot digest, typed arguments and deadline. The caller supplies an intent; runtime injects identity, binding, policy and receipt fields. The registry is the source for internal JEV selection and MCP schema export.

Common refs are opaque, typed, partitioned and revisioned. They are not raw DOM selectors, JavaScript paths, network URLs or authority tokens. Numeric/string/array bounds derive from the construction/task configuration. All tool schemas reject additional properties.

| Tool                    | Required typed input                                    | Output and verification responsibility                                                 |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `web.discover`          | admitted page target, read scope                        | Graph revision, catalog, coverage; collector/source identity checks.                   |
| `web.search_codebase`   | bounded query, entity kinds, scope, limit/cursor        | Matching semantic refs with evidence/status; no target authority.                      |
| `web.inspect`           | entity/resource ref, closed inspection kind, field list | Observation/dataset ref; source revision and requested-field coverage.                 |
| `web.get_capabilities`  | page/component scope                                    | Available tool/action refs, unsupported reasons, permitted task-tab inventory.         |
| `web.navigate`          | discovered route ref or bound explicit-user URL ref     | Navigation receipt, destination context and predicate evidence.                        |
| `web.switch_tab`        | task-authorized tab ref                                 | Current target context; window/profile/owner check.                                    |
| `web.click`             | action ref, supported activation mode                   | Execution/verification receipt; no arbitrary coordinate or key sequence.               |
| `web.fill`              | action ref, string ArgumentBinding                      | Observed control value/effect; no implicit submit.                                     |
| `web.select`            | action ref, option/value-state ArgumentBinding          | Verified selected/checked state.                                                       |
| `web.scroll`            | component ref, bounded direction/extent                 | Scroll/coverage/restoration observation; no business mutation hidden as a read.        |
| `web.wait_for`          | registered predicate ref, bounded timeout               | Satisfied/timeout/current evidence; elapsed time is not success proof.                 |
| `web.extract`           | component/data ref, field projection, coverage goal     | Immutable dataset manifest/chunks, count and omissions.                                |
| `web.query`             | dataset refs, typed query AST                           | Deterministic result, query digest and source evidence lineage.                        |
| `web.get_chart_data`    | chart ref, permitted channel, coverage goal             | Data or inferred visual observations with channel/limitations.                         |
| `web.get_table_data`    | collection ref, viewport/full goal, bound cursor        | Immutable dataset, identity/EOF/coverage/restoration evidence.                         |
| `web.get_observed_api`  | page/API observation ref, bounded filter                | Scrubbed metadata/permitted response evidence; no replay operation.                    |
| `analysis.run`          | AnalysisRequest                                         | Accepted/unaccepted typed analysis; no executable browser arguments.                   |
| `task.verify`           | registered predicate refs and expected goal revision    | Verification receipts; no arbitrary executable expression.                             |
| `task.request_approval` | runtime-owned prepared-step/plan ref                    | Pending prompt or policy decision; no self-approval.                                   |
| `task.complete`         | proposed outcome, goal/evidence/result refs             | Accepted terminal commit or typed rejection with remaining predicates.                 |
| `web.invoke_action`     | registered Action ref, typed ArgumentBindings           | Declared effect and independent verifier; unregistered method/function paths rejected. |

`web.query` admits projection, typed equality/range filters, sort, group, count/sum/min/max/average and bounded limit, with explicit missing-value/unit behavior. It has no joins across partitions, arbitrary SQL, expressions, network access or user code. Define numerical precision/null rules in the executable contract and golden fixtures before exposing each operator. Until then the operator is unavailable.

## 5. Execution and approval protocol

`PreparedStep` binds task/runtime/plan/tool/capability revisions, profile/window/tab/frame/document/route identity, semantic target revision, current observation digest, argument digest, expected effect/predicates, policy revision, expiry and cancellation generation. Preparation returns `ready`, `already_satisfied`, `needs_input`, `needs_approval`, `unavailable` or `stale`. Only `ready` can proceed toward dispatch.

For explicit approval, backend creates a pending `ApprovalRequest` and renders the existing card. The extension validates the responding UI sender, prompt revision and current policy/binding, then issues an approval receipt tied to the exact prepared digest. Backend records the approval fact. Browser consumes the authority once immediately before dispatch. MCP/model/page messages cannot forge that response. Automatic policy approval uses the same binding/consumption mechanism with a distinct source and cannot cover the hard-risk floor.

Approval receipt fields include ID, source (`user`/`policy`), task/plan/step, prepared digest, policy revision, permitted effect/scope, expiry and current browser/runtime epoch. Persist audit facts, not a reusable bearer grant. Reconnect/restart requires revalidation; a changed epoch or material binding invalidates executable authority and uses a new prompt if necessary.

Dispatch sequence:

1. Backend atomically commits `StepPrepared`/approval fact and reserves an attempt with a fresh dispatch ID.
2. Browser checks request generation, lease, live target uniqueness, actionability, policy/approval and no-op predicate again.
3. Browser commits a dispatch reservation in IndexedDB before any side effect, keyed by dispatch ID and prepared digest. An existing ID with a different digest rejects; an identical ID returns its receipt/ambiguous state.
4. Browser consumes the bound approval, dispatches once and records actual command progress/result. Multi-command CDP input can be partially dispatched.
5. Independent observer verifies the specified postcondition, updates evidence/graph and returns a receipt. Backend commits the receipt and next phase atomically with events.

A receipt includes dispatch state (`not_dispatched`, `reserved`, `dispatched`, `unknown`), adapter/command progress, execution error if any, verification (`passed`, `failed`, `unknown`, `not_run`), evidence refs and goal linkage. Cancellation, a model answer or UI rendering cannot rewrite a recorded dispatch fact.

If either side crashes after reservation but before a reliable receipt, the attempt is ambiguous and cannot automatically run again. Recover by observing current state and obtaining the original receipt when available. A later user-requested retry is a new task/proposal, not a hidden retry of the same dispatch. Already-satisfied state yields a no-op receipt with zero dispatches.

## 6. Task state machine, persistence and failure handling

Internal phases follow the reference. The engine stores phase and outcome separately, plus a suspension reason when applicable.

| Current phase                    | Event/condition                           | Allowed next phase                                                 |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| admission                        | TaskAccepted                              | intent_classification                                              |
| intent_classification            | validated JEV route                       | codebase_discovery or waiting_input                                |
| codebase_discovery               | sufficient bounded facts                  | planning                                                           |
| planning                         | valid next step                           | approval_pending, tool_execution, analysis, or waiting_input       |
| approval_pending / waiting_input | current trusted answer                    | planning or tool_execution after revalidation                      |
| tool_execution                   | receipt recorded                          | result_verification                                                |
| result_verification              | valid next decision                       | planning, analysis, result_acceptance, or suspended                |
| analysis                         | validated typed analyst output            | result_acceptance or planning for an authorized extra-data request |
| result_acceptance                | all required goals/evidence accepted      | completed                                                          |
| any nonterminal phase            | connectivity/reconciliation issue         | suspended, preserving prior phase                                  |
| suspended                        | validated recovery within budget          | safe prior phase; never blindly re-enter ambiguous dispatch        |
| any nonterminal phase            | cancellation/deadline/unrecoverable error | cancelled or failed, with truthful outcome/reason                  |

`completed` requires verified requested goal predicates and accepted required analysis. Unverified/ambiguous results terminate as `failed` with `outcome=UNKNOWN` or an explicit incomplete reason; the presentation adapter preserves that distinction rather than showing a generic execution failure. A `VERIFIED` action can coexist with an incomplete task goal.

SQLite tables: `tasks`, `task_events`, `plans`, `steps`, `dispatch_intents`, `approval_facts`, `decision_attempts`, `analysis_attempts`, `projection_refs`, `leases`, `settings`, `migration_journal`. Unique keys enforce request idempotency, event sequence and dispatch IDs. Append events and materialized task revision in the same transaction using compare-and-swap. One task lease holder advances a task; browser per-tab fencing prevents competing writers from JEV/MCP/legacy runtimes.

Lease generation and runtime epoch accompany every command. After backend restart, reconcile unfinished dispatches, browser identity and cancellation before claiming a lease. An unacknowledged Stop records a browser-local revocation intent, blocks further dispatch immediately and synchronizes cancellation on reconnect. UI shows cancellation pending until backend acknowledges; it cannot claim a completed remote cancellation from a local button click alone.

Terminal task metadata and dispatch deduplication receipts have a proposed 30-day retention; expired terminal tasks reject new commands as `TASK_EXPIRED`. Raw task values/dataset projections expire at terminal cleanup or their shorter data TTL. Never prune a live/ambiguous attempt while an accepted command can still arrive; after task expiry, reject by task/runtime epoch even when detailed records have been pruned. Policy can shorten content retention without reopening old dispatch IDs.

## 7. Error contracts and UI projection

`TaskError` has stable code, stage, retriable flag, safe message key, dispatch uncertainty, related evidence IDs and original failure correlation. Only the runtime classifies retryability; a model cannot set it. Initial codes include `BINDING_STALE`, `CAPABILITY_UNAVAILABLE`, `POLICY_DENIED`, `APPROVAL_EXPIRED`, `COLLECTION_PARTIAL`, `BUDGET_EXHAUSTED`, `PAGE_UNSTABLE`, `CONTROLLER_UNAVAILABLE`, `ANALYSIS_UNAVAILABLE`, `BACKEND_UNAVAILABLE`, `PROTOCOL_MISMATCH`, `DISPATCH_UNKNOWN`, `EVIDENCE_INVALID`, `TASK_EXPIRED` and `MIGRATION_INCOMPLETE`.

The existing UI states project as follows: admission → ACCEPTED; active/suspended → RUNNING with truthful stage/reason; prompt wait → WAITING_USER; completed/failed/cancelled → TERMINAL with separate action and goal detail. Suspended connectivity uses the existing delayed-connection output; terminal UNKNOWN retains guidance against automatic replay. Stage transitions and task progress are durable events, not optimistic client guesses.

Model retries preserve the first failure and consume budgets. Stale binding, denied consent, cancellation, invalid approval and unknown dispatch never trigger a model fallback that can mutate. GPT unavailability leaves analysis unavailable; JEV unavailability leaves controller unavailable. No change to role authority is permitted as error recovery.

## 8. Analyst and MCP boundaries

`AnalysisRequest` identifies task/analysis attempt, objective, approved immutable dataset refs/digests, deterministic query results, criteria, output schema and resource/egress budget. Data resolver rejects expired, foreign-partition, changed-digest or unconsented sources. Provider model/version/config revision is pinned. No browser schemas or live refs appear in the Responses request.

`AnalysisResult` contains summary, findings with supporting evidence/row/field/query refs, limitations and recommendations. Core validates schema and reference resolution; domain checks test factual support before JEV result acceptance. A structurally valid citation is insufficient. Additional-data requests name required data properties/coverage, never browser commands. JEV chooses whether to acquire them under the same remaining task budget.

MCP high-level calls admit JEV-owned tasks through `agent.execute_request`; status/cancel operations use task handles. Low-level calls create or join an explicitly scoped `external` task and invoke the same registry/runtime. No client-supplied task/profile/approval ID bypasses ownership validation. Gateway exposes only negotiated tools; it preserves request/tool-result correlation and reports pending approval without blocking task durability on one open client connection.

For external low-level tasks, admission records `controller=external` and enters planning with an `ExternalStepProposed` event instead of JEV intent/selection calls. Core still validates the plan, bindings, approvals, dispatch and goal acceptance through the same state machine. It never treats external prose as verified completion. Deployments requiring JEV-only control do not negotiate this mode; internal GPT analysis cannot impersonate an external MCP principal.

Separate the new inbound MCP gateway from legacy outbound profile-bound Business MCP. The latter keeps its named original protocol in `integration-adapters` until actual standards-compatible transport is implemented and qualified. Platform signature/trust/PDP/audit semantics remain versioned imports/ports with explicit compatibility evidence.

## 9. Required contract evidence

S28 covers authentication/framing/version/large-transfer negatives; S29 covers immutable graph/dataset identity, revision and privacy; S30 covers schema/effect/approval/dispatch; S31 covers all crash windows, duplicate/delayed events, cancellation and expiry; S33 covers full state transitions and accepted goal evidence; S34 covers analysis resolution/support and no browser authority; S35 covers real MCP continuation and cross-client denial; S36 covers cross-store migration fences and supported-platform IPC/install behavior.

Every successful end-to-end record must connect UI request → task → JEV decision → tool invocation → approval source → dispatch receipt → evidence/graph revision → goal/analysis acceptance → final UI. Negative records preserve the first failure and actual dispatch count. No mock or historical result alone qualifies a live provider, real MCP client or installed release.
