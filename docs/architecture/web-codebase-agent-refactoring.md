# Web Codebase Agent detailed refactoring design

Status: **Planned — design only.** Date: 2026-10-18.

This document makes the [migration architecture](web-codebase-agent-migration.md) implementable through named seams, owners, contracts and retirement gates. [Codebase construction](web-codebase-construction.md) defines generation algorithms and limits; [runtime contracts](web-codebase-runtime-contracts.md) define coordination and recovery. [S26–S37](../sprints/README.md#web-codebase-agent-migration-s26-s37) are the implementation backlog. No source, schema, test, dependency, build or generated artifact is changed by this design.

## 1. Baseline and decisions carried forward

Inspected baseline: clean `master` at `8eb08e116cb90c8182d0ac449e6cabace68488cb`, package/manifest `0.1.117`. This revision includes the earlier migration documents and diagnostics work. The earlier architecture's dirty-tree baseline remains historical; this is the baseline for the detailed design. Recheck it before implementation.

Preserve the existing UI presentation, JEV controller/GPT analyst separation, local backend, IndexedDB knowledge authority, SQLite task authority, shared policy/runtime and bounded MCP integration. Replace all non-UI responsibility boundaries. No React migration, general-purpose model plugin framework, remote control service or new product dashboard is introduced.

Several entrypoints exceed the current 199-line source rule: Content entry 1,801 lines, Act step runner 1,594, Act harness turns 1,046, Side Panel entry 1,891, CDP adapter 453. These are static measurements, not a failed test run. Split them by behavior during the owning Sprint; a renamed monolith does not satisfy migration. Splitting UI controllers must preserve DOM/CSS and interaction structure.

Design precedence: user UI/no-code constraints → migration architecture decisions → these detailed pending contracts → Sprint work/acceptance cards. Implementation remains the SSOT for current behavior. Once a contract is implemented, link its source and retire duplicate normative prose from these pending designs.

## 2. Refactoring units and ownership

All destinations below are proposed paths. `R` means reuse a tested algorithm with new ports/contracts; `X` means replace control flow; `P` means preserve presentation. A source prefix covers its associated helpers, tests and callers, not only the named entrypoint.

| Unit | Current source seam                                                                              | Target files / public responsibility                                                                                   | Treatment / Sprint                                                                     |
| ---- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| RF01 | `service-worker/entry.ts`, `bootstrap.ts`, `runtime-registration.ts`, routers                    | `apps/chrome-extension/src/worker/{entry,register-browser-events,register-ui-messages}.ts`                             | X: browser composition and admission only; S28/S37                                     |
| RF02 | `runtime-state.ts`, `runtime-chat.ts`, `runtime-lifecycle.ts`, `runtime-execution.ts`            | `apps/agent-server/src/compose-services.ts`; extension `compose-browser-services.ts`                                   | X: explicit dependencies, no shared Worker globals; S28/S33                            |
| RF03 | `ask-chat-runner.ts`, `act-chat-start.ts`, `ask-act-intent-router.ts`                            | `packages/task-engine/src/{admit-task,classify-intent,mode-capabilities}.ts`                                           | X: one mode-scoped task loop; S27/S33                                                  |
| RF04 | `act-step-runner.ts`, `act-harness-turns.ts`, `act-plan-*`, `prepared-task-review.ts`            | task engine `{advance-task,plan-candidates,plan-revision,select-next-step,accept-result}.ts`                           | X: JEV decisions + deterministic phase reducer; S27/S33                                |
| RF05 | `request-store.ts`, `request-persistence.ts`, `request-budget.ts`, `chat-request-lifecycle.ts`   | task engine `{task-store-port,event-reducer,budget-accountant}.ts`; server `storage/{tasks,events,leases}.ts`          | X: SQLite-backed lifecycle; S31                                                        |
| RF06 | `act-goal-*`, `act-local-goal.ts`, `act-logical-results.ts`, `act-mutation-history.ts`           | `packages/tool-runtime/src/verification/{predicate-registry,verify-goal,reconcile-receipt}.ts`                         | R: independent fact checking; X: primary-model finalization; S30/S31/S33               |
| RF07 | `ask-tools.ts`, `act-tools.ts`, `act-read-tool-registry.ts`, resource/component/workflow schemas | `packages/tool-registry/src/{definitions,catalog,availability,wire-names}.ts` plus one file per tool group             | R: supported operations; X: competing inventories; S30/S32/S34                         |
| RF08 | proposal executor/readiness, `state/mutation-*`, confirmation, approval/plan stores              | `packages/tool-runtime/src/{prepare-step,execute-step,receipt}.ts`; `policy-engine/src/{evaluate,approval-binding}.ts` | R: preflight/no-op/deny invariants; X: orchestration; S30/S31                          |
| RF09 | `content/entry.ts` message cases, document epoch and mutation observer                           | extension `content/{entry,message-router,document-session,observe-changes}.ts`                                         | R: browser registration; X: mixed collection/execution composition; S28/S29            |
| RF10 | `semantic-collector.ts`, `collection-discovery.ts`, `component-observation.ts`                   | `packages/collector/src/dom/{walk,components,controls,collections,normalise}.ts`                                       | R: safe observation; X: authoritative classification and oversized traversal; S29      |
| RF11 | `content/ref-registry.ts`, `preflight.ts`, executor, checked-control/boolean-state/UI completion | `packages/browser-runtime/src/dom/{live-bindings,preflight,dispatch,observe-result}.ts`                                | R: unique/live target and verifier logic; S30                                          |
| RF12 | collection orchestrator/accumulator/registry and `service-worker/readers/`                       | collector `data/{reader-registry,read-window,accumulate,coverage,restore-scroll}.ts`                                   | R: supported readers and identity rules; X: Worker-owned loop; S29/S32                 |
| RF13 | page-resource store/search/progress and `content/page-resources.ts`                              | collector `resources/{inventory,bounded-read,static-relations}.ts`; repository resource evidence                       | R: consent/size/revision checks; X: request-only catalog ownership; S29/S32            |
| RF14 | `page-api/`, `page-api-*-runner.ts`, `page-method-*`                                             | browser runtime `registered-actions/`, collector `main/`, integration adapter action imports                           | R: registered adapters; X: arbitrary method proposals; S30/S32/S37                     |
| RF15 | `cdp/`, bounded-CDP runtime, vision capture                                                      | browser runtime `cdp/{broker,attach,commands,cleanup}.ts`; collector `{ax,network,visual}/`                            | R: bounded input; extend observations with separate capabilities; S30/S32              |
| RF16 | `providers/jev-*`, decision questions/coordinator/state, model bindings                          | `packages/provider-adapters/src/jev/`; task engine `decisions/`                                                        | R: native parser/transport validation; X: optional-JEV/primary routing; S27/S33        |
| RF17 | OpenAI-compatible transport/request/body/SSE and provider runtime                                | provider adapters `gpt/`; `packages/analysis-engine/src/{analyse,resolve-data,validate-findings}.ts`                   | R: bounded Responses transport; X: general browser tool loop; S34                      |
| RF18 | `settings/provider-{settings,state,config-validation,secret-write}.ts`                           | server `settings/{service,migrate,secret-store}.ts`; shared public setting contracts                                   | R: identity/blank-secret semantics; X: UI-local service ownership; S28/S34/S36         |
| RF19 | `policy/`, enterprise policy runtime, source consent                                             | `packages/policy-engine/src/`; browser final enforcement; server policy mirror                                         | R: deny/consent rules; X: duplicate grant stores; S30/S35                              |
| RF20 | `learned-profile/` store, management, identity, commands                                         | builder `imports/learned-workflow.ts`; repository workflows/history; presentation manager adapter                      | R: advisory successful metadata; X: separate learned executor; S29/S36/S37             |
| RF21 | `profile/`, resolver runtime, Business MCP, runtime evidence, `studio/`                          | `packages/integration-adapters/src/{profiles,business-mcp,enterprise,audit,studio}/`                                   | R: original trust/envelope verification; X: direct execution/hidden normalization; S35 |
| RF22 | workflow catalog/resource/record/selection/preview/session handlers                              | repository workflow APIs; task engine plan expansion; browser recording; presentation adapter                          | R: recording and UI preview; X: separate workflow lifecycle/executor; S29/S33/S35      |
| RF23 | `sidepanel/entry.ts`, request client, event rendering, diagnostics view                          | existing app UI plus `presentation/{task-client,event-projector,approval-client,export-client}.ts`                     | P: views; X: data/control ownership; S28/S33/S36                                       |
| RF24 | Settings entry/forms, learned-profile manager, navigation/CSS                                    | preserved app Settings; `presentation/settings-client.ts`, `workflow-manager-client.ts`                                | P: layout/navigation; X: backend bindings and truthful role text; S28/S34/S36          |
| RF25 | tab chat sessions, chat persistence/events                                                       | app `presentation/history-store.ts`; backend task-event API                                                            | R: history/window ownership; X: task state masquerading as chat state; S31/S33         |
| RF26 | native client, .NET host, offscreen fetch                                                        | server `native/{entry,framing,launcher}.ts`, `ipc/`; extension `bridge/`                                               | X: new protocol; remove old host/provider offscreen path; S28/S37                      |
| RF27 | diagnostics/trace/masking and provider-call correlation                                          | `packages/diagnostics/src/{event,sanitize,correlate,export}.ts`                                                        | R: useful correlation; X: process-local ownership and raw import; S28/S31/S36          |
| RF28 | security canonicalization/redaction/validation/deadline                                          | small pure modules in `shared`, policy and diagnostics                                                                 | R: tested primitives; split privileged operations from data transforms; S28–S36        |
| RF29 | deployment compatibility, build scripts, manifest/assets/workspace                               | app build configurations, release compatibility manifest, installers                                                   | P: UI assets; X: app paths/permissions/build/delivery; S28/S36/S37                     |
| RF30 | unit/fixture/e2e, examples, docs/site, source/install/test guidance                              | package tests, shared fixtures/integration/evals/e2e, updated operational docs                                         | R: regression intent/evidence IDs; X: runner/artifact bindings; S26–S37                |

S26 produces an exact per-file disposition manifest from the then-current tree. Every file must resolve to an RF unit and owning Sprint; unknown files fail inventory coverage. Final deletion uses caller/asset/message/storage consumer scans, not filename matching alone.

## 3. Public ports and forbidden dependencies

Public API names below are proposed contracts, not source code added in this task. Versioned domain schemas own their fields; adapters cannot define alternative loose records.

| Port                     | Operations                                                                                                                 | Implementer / caller                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `BrowserObservationPort` | `discover`, `inspect`, `readWindow`, `observeAfter`, `cancel`                                                              | Extension collector; backend Tool Runtime                                                                                               |
| `CodebasePort`           | `search`, `read`, `commitObservation`, `applyDelta`, `proposeAnnotation`, `resolveDataset`, `invalidate`, `manageWorkflow` | Extension repository service; collector/builder own fact writes; authenticated backend has scoped query/management/annotation proposals |
| `BrowserExecutionPort`   | `prepare`, `dispatch`, `receipt`, `cancelGeneration`                                                                       | Extension browser runtime; backend Tool Runtime                                                                                         |
| `TaskStore`              | `create`, `load`, `appendEvents(expectedRevision)`, `claimLease`, `finish`                                                 | Backend SQLite; Task Engine                                                                                                             |
| `ControllerPort`         | `evaluate(DecisionFrame)`                                                                                                  | JEV adapter; Task Engine only                                                                                                           |
| `AnalysisPort`           | `run(AnalysisRequest)`, `cancel`                                                                                           | GPT Analysis Engine; Task Engine/runtime                                                                                                |
| `PolicyPort`             | `evaluate`, `prepareApproval`, `consumeApproval`, `invalidateRevision`                                                     | Shared pure rules + local authority adapters; runtime                                                                                   |
| `TaskClientPort`         | `start`, `status`, `eventsAfter`, `cancel`, `answerPrompt`                                                                 | Presentation adapter / MCP API; backend admission                                                                                       |
| `SettingsPort`           | `readPublic`, `writeProvider`, `assignRoles`, `testConnection`, `exportPublic`                                             | Backend settings service; existing Settings forms                                                                                       |

`shared` has no Chrome, Node filesystem, network or database imports. Repository/building code cannot call providers. GPT analysis cannot import Browser Execution. Registry definitions are data plus pure validation; executors are injected. MCP reaches browser actions only through Task/Tool APIs. Dependency checks inspect package exports and build graphs as well as relative imports.

## 4. Concrete extraction sequence

1. **Characterize:** capture expected behavior at existing public boundaries, including failures. Do not mirror internal helper implementations in tests.
2. **Extract pure contracts/algorithms:** create schema/port modules with explicit inputs. Move canonicalization, validation and readers without changing their caller's behavior initially.
3. **Introduce adapters:** old callers can temporarily invoke new pure components. Only the existing runtime owns dispatch at this stage. Adapter names and expiration Sprint are inventoried.
4. **Build target composition:** run new admission/collection/task logic against controlled fixtures behind a development-only runtime selector. A task is pinned to one runtime; no per-step failover.
5. **Switch a complete vertical path:** Ask read, Act mutation, then analysis/workflow/MCP, each with schema → executor → result continuation → final UI evidence.
6. **Drain and retire:** migrate stored data, disable legacy writes, remove old consumers and temporary exports, then remove the selector. New aliases must not conceal a second executor.

For the Act step runner, separate candidate creation, decision, value binding, plan revision, approval preparation, dispatch request, observation and goal acceptance. Persist each transition through `TaskStore`; do not copy the 1,594-line closure into a Node file. For Content entry, separate document registration, request validation, collector routing, live bindings, input execution and mutation observation. MAIN helpers stay serializable and free of injected module closures, validated in actual Chrome.

For Side Panel entry, separate DOM view factories and event-to-view updates from task clients. Preserve existing element IDs/classes, dialogs, transcript ordering, focus and spacing. Do not place policy evaluation in an event reducer. Expose only public safe fields to the UI; form input values travel over a separate bounded command rather than chat-history replay.

## 5. UI and message compatibility

UI structure preservation includes the composer, Ask/Act switch, Stop, approval/value/source-consent cards, Options sections/forms, workflow recording/preview, separate profile manager and diagnostics export. Backend installation uses existing status/help regions and an installer command, not a new UI workflow.

| Existing route                                            | Target adapter operation            | Compatibility/deletion rule                                                                                                                         |
| --------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHAT_REQUEST_START`                                      | `TaskClientPort.start`              | Retain UI request ID alias; admission commits before ACK.                                                                                           |
| `CHAT_REQUEST_STATUS`                                     | `status` + event cursor projection  | Return old view states with new reason/detail; never map suspended to completed.                                                                    |
| `CHAT_REQUEST_CANCEL`                                     | `cancelGeneration`                  | Persist cancellation and notify browser; late results cannot restart the task.                                                                      |
| `CHAT_REQUEST_RESUME`                                     | `answerPrompt` with prompt revision | Bind selection to the exact current prompt; reject stale cards.                                                                                     |
| `ACT_*` review/value/confirmation messages                | `answerPrompt` / approval response  | UI adapter only; no direct legacy proposal execution. Enumerate exact current names in S26.                                                         |
| Provider management/routing messages                      | `SettingsPort`                      | Existing forms; analyst/controller roles and `primary` failure-option migration as defined in architecture.                                         |
| Workflow/profile management messages                      | `manageWorkflow` / import/preview   | Preserve existing management operations; stored recipes remain advisory.                                                                            |
| Diagnostics list/export                                   | sanitized task-event query/bundle   | Keep trace correlation across extension/backend/MCP.                                                                                                |
| Legacy `CHAT_SEND`, `START_ACT`, fixture execution routes | No production target route          | Temporary compatibility may only enter new admission; remove production bypasses at S37. Fixture-only routes must be absent from release artifacts. |

Current `provider_role: primary/decision` may exist only in the temporary presentation projection. Internal roles are `controller/analyst`; external low-level MCP tasks identify `external`. Changing labels does not turn GPT into a controller. A disabled JEV setting remains disabled and blocks new autonomous tasks after cutover; history/settings remain usable.

## 6. Storage replacement and upgrade units

Keep data ownership explicit across conversion. Source-key mapping remains in the architecture; the target operational migration is defined here.

| Migration unit               | Conversion and validation                                                                                                                                     | Commit authority                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| MG01 providers/settings      | Decode v1/v2; copy public records, preserve disabled/unusable entries, move secrets to validated secret store/session-only broker; never infer role readiness | Backend settings transaction plus extension acknowledgment |
| MG02 permissions/preferences | Translate only equal-or-narrower scope; explicit denies survive; Full cannot bypass target hard risk floor                                                    | Extension policy revision and backend mirror digest        |
| MG03 recipes/workflows       | Import source IDs/names/notes/history as advisory records, retain source digest; unsupported steps quarantined                                                | IndexedDB transaction                                      |
| MG04 history                 | Preserve messages/window/thread context; archive terminal summaries; no old approval/value/ref replay                                                         | Extension presentation store                               |
| MG05 active execution        | Stop admission, drain/cancel old runs, reconcile receipts and CDP ownership; unknown dispatch remains unknown                                                 | Both runtimes' migration journal                           |
| MG06 diagnostics             | Keep old evidence separately under retention; project safe IDs/status only, no raw bulk import                                                                | Diagnostics retention owner                                |

Use a coordinator record with `migrationId`, source/target schema sets, immutable source digests, per-store progress, quarantine counts, target digests, phase and timestamps. Phases are `prepared`, `copying`, `validated`, `committed`, `retired`. Source namespaces remain read-only during copy. Cross-store commit is a fenced protocol: extension and backend acknowledge the same manifest before the active-runtime pointer changes. A crash leaves admission closed until reconciliation chooses the original namespace or the fully validated target. Never imply one transaction spans IndexedDB and SQLite.

Re-running a unit compares source digest and migration ID and resumes from committed checkpoints without duplicating records. Secret migration uses credential references and explicit source cleanup only after target readback, never putting secrets into the manifest. Missing OS secret storage yields session-only setup, not silent plaintext persistence.

Rollback drains target tasks, freezes both mutation admission paths, verifies a compatible old release set and selects the preserved legacy namespace. Target-only data remains inspection-only. No backward schema converter generates old grants or live requests. Delayed messages from the other runtime fail the runtime epoch check.

## 7. Build, packaging and regression work

The target workspace uses `apps/*` and `packages/*`. Keep pnpm 9.15.4; pin selected Vite, Zod, SQLite and MCP/provider integration versions in S28/S34/S35 after implementation-time compatibility checks. The design introduces no lockfile/dependency edits.

Vite bundles existing extension UI and browser entrypoints. Verify emitted service worker/content/Options/profile-manager paths, content/MAIN isolation, no runtime Node imports, CSP-compatible assets, trace instrumentation and release privacy mode. Node apps have separate build/test entrypoints and package exports. Package validation must inspect actual emitted bundles; TypeScript success alone cannot qualify MAIN execution.

Provide version-preserving validation commands and explicit version-changing release commands. Version compatibility is checked through a release manifest carrying extension/backend/MCP/protocol/tool-schema/graph-schema versions and artifact digests. Installer/repair/uninstall tests cover Native Messaging registration, Chrome identity, IPC access and profile isolation on each supported OS. Preserve the old source-size/module-boundary checks' intent while extending their scope to every new package.

Required regression families are assigned, not discarded:

- Navigation verified before later goal uncertainty; no-op and capability/executor/verifier parity: S30/S31/S33.
- Request cancellation, page/frame binding and one-time input/approval consumption: S30/S31.
- Virtual-grid deduplication/completeness, per-unit collection deadline and restored scroll: S29/S32.
- S25 parser/role/config-secret boundaries: S27/S34, with target-role expectations replacing only intentional old fallback behavior.
- Learned metadata, management/window ownership and workflow preview: S29/S33/S36.
- Provider-call correlation and privacy/export mode: S28/S31/S34/S36.
- Signed profiles, Business MCP and enterprise deny: S35; retain original cross-repository backlog dates and IDs.

## 8. Sprint map and final deletion gates

| Sprint | Original slice | Scope                                                    | Hard prerequisites                        |
| ------ | -------------- | -------------------------------------------------------- | ----------------------------------------- |
| S26    | M00            | Baseline, UI, exact refactoring inventory                | None                                      |
| S27    | M01            | JEV decision protocol and feasibility                    | S26                                       |
| S28    | M02            | Workspace, presentation seam, backend/native bridge      | S26                                       |
| S29    | M03            | Codebase algorithms, DOM and persistence                 | S28; JEV semantic selection waits for S27 |
| S30    | M04            | Registry, policy, browser execution and verification     | S28, S29                                  |
| S31    | M05            | Durable tasks, receipts and recovery                     | S30                                       |
| S32    | M06            | Advanced collectors and coverage                         | S29, S30, S31                             |
| S33    | M07            | JEV-owned Ask/Act and workflow loop                      | S27, S29, S31                             |
| S34    | M08            | GPT analysis and evidence acceptance                     | S33                                       |
| S35    | M09            | MCP and external adapter migration                       | S31, S33, S34                             |
| S36    | M10            | Data migration, complete qualification and packaging     | S32, S34, S35                             |
| S37    | M11            | Cutover, old-runtime retirement and release verification | S36                                       |

S26–S37 are Planned. A completed design is not a completed implementation Sprint. Read-only preparation can proceed before a live-provider gate, but a dependent runtime cannot claim completion without that gate. No calendar or effort estimate is asserted before S26/S27 measurements.

At S37, the inventory must show no unmapped source or residual production dispatch owner. Searches for old messages/schemas/stores must classify each hit as presentation compatibility, historical/test fixture, importer, or removed behavior. No arbitrary exclusion list hides a runtime call. Every retained adapter names its consumer and contract version; every removed module has regression evidence and zero live callers. Release acceptance covers all original reference sections, including advanced collectors and MCP, while preserving current UI structure.
