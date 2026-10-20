# 코드 탐색 안내

S32: [advanced collector contracts and adapters](../packages/collector/src/advanced/index.ts), [bounded CDP broker](../packages/browser-runtime/src/cdp/broker.ts), [Chrome debugger transport](../packages/browser-runtime/src/cdp/chrome-transport.ts), [current disclosure consent](../packages/browser-runtime/src/collector-consent.ts), [advanced read-tool composition](../apps/chrome-extension/src/collectors/advanced-tools.ts). [Evidence and limits](evidence/s32-advanced-collectors-2026-10-20.md); target-only, with S13 regression failures and product/virtual-data acceptance still open.

S31: [SQLite task store and intent journal](../apps/agent-server/src/tasks/index.ts), [durable reducer/budget/history](../packages/task-engine/src/durable/index.ts), [browser revocation](../packages/browser-runtime/src/revocation.ts), [receipt synchronization](../apps/chrome-extension/src/runtime/durable-dispatch.ts), [explicit SQLite factory](../scripts/s31/open-store.mjs). [Evidence and remaining acceptance](evidence/s31-durable-recovery-2026-10-20.md); target-only, Node 22.13+ for SQLite, production routing remains unchanged.

S30: [registry](../packages/tool-registry/src/index.ts), [runtime](../packages/tool-runtime/src/index.ts), [policy](../packages/policy-engine/src/index.ts), [browser adapters and dispatch journal](../packages/browser-runtime/src/index.ts), [target continuation](../apps/chrome-extension/src/runtime/continuation.ts). [Evidence and remaining acceptance](evidence/s30-runtime-2026-10-19.md); production routing remains unchanged.

S29: [schemas](../packages/codebase-schema/src/index.ts), [collector](../packages/collector/src/index.ts), [builder](../packages/codebase-builder/src/index.ts), [repository/read/query ports](../packages/codebase-repository/src/index.ts), [discovery composition](../apps/chrome-extension/src/codebase/discover.ts). These target-only paths preserve the existing production entrypoint; [verification and limits](evidence/s29-construction-2026-10-19.md).

S28 target paths: [browser presentation](../apps/chrome-extension/src/presentation), [bridge adapters](../apps/chrome-extension/src/bridge), [native backend](../apps/agent-server/src), [shared protocol](../packages/shared/src/bridge.ts), [isolated build](../scripts/s28/build.mjs). Normal production packaging retains the existing entrypoint; [acceptance gaps](evidence/s28-workspace-bridge-2026-10-19.md) remain.

S27 target-only decision contracts live in [task-engine decisions](../packages/task-engine/src/decisions/index.ts), with the [native adapter](../packages/provider-adapters/src/jev/index.ts) and [checks](../extension/tests/unit/migration/s27). This path is not selected by production routing; [live feasibility failed](evidence/s27-controller-protocol-2026-10-19.md).

## S24 learned page profiles

Runtime: [learned-profile](../extension/src/learned-profile), [Worker bootstrap](../extension/src/service-worker/learned-profile-runtime.ts), [trusted management messages](../extension/src/service-worker/learned-profile-message-handler.ts). UI: [Options launcher and feature setting](../extension/src/settings/learned-profile-options.ts), [separate management window](../extension/src/settings/learned-profiles.html), [list and selection controller](../extension/src/settings/learned-profile-management.ts), [detail and history](../extension/src/settings/learned-profile-detail.ts). Checks: [unit tests](../extension/tests/unit/learned-profile), [management window evidence](evidence/s24-profile-manager-2026-10-14.md), [learning delivery evidence](evidence/s24-learned-page-profiles-2026-10-13.md).


현재 동작과 계약은 아래 소스에서 확인한다. 이 문서는 진입점 안내이며 별도의
기능 명세나 완료 상태표가 아니다. 실제 Provider에 제공되는 도구는 schema 구성,
등록된 executor, 호출 결과의 후속 turn을 함께 따라가며 확인한다.

## 진입점과 계약

| 영역                            | 확인할 코드                                                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 권한·Chrome 최소 버전·실행 문서 | [manifest](../extension/manifest.json), [managed storage schema](../extension/managed-storage-schema.json)                                                                                                                           |
| Worker 시작·메시지 등록         | [bootstrap](../extension/src/service-worker/bootstrap.ts), [registration](../extension/src/service-worker/runtime-registration.ts)                                                                                                   |
| 요청 admission·취소·수명        | [request message handler](../extension/src/service-worker/chat-request-message-handler.ts), [request context](../extension/src/service-worker/request-context.ts), [request store](../extension/src/service-worker/request-store.ts) |
| 공유 메시지·상태·action         | [contracts](../extension/src/contracts), [request types](../extension/src/contracts/request-types.ts), [action types](../extension/src/contracts/action-types.ts)                                                                    |
| Side Panel·설정                 | [Panel](../extension/src/sidepanel/panel.ts), [request client](../extension/src/sidepanel/request-client.ts), [Settings](../extension/src/settings/entry.ts)                                                                         |
| 대화·storage 복구               | [tab chat sessions](../extension/src/state/tab-chat-session-store.ts), [chat lifecycle](../extension/src/service-worker/chat-run-lifecycle.ts), [storage bootstrap](../extension/src/service-worker/storage-bootstrap.ts)            |

## Ask와 Act

[runtime-chat.ts](../extension/src/service-worker/runtime-chat.ts)에서 Ask runner,
Act의 읽기 경로, Act 시작·step 실행·proposal 실행이 조립된다.

| 경로                                       | 확인할 코드                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask의 Provider 요청·tool 결과 continuation | [Ask runner](../extension/src/service-worker/ask-chat-runner.ts), [read schemas](../extension/src/service-worker/ask-tools.ts), [executor](../extension/src/service-worker/ask-tool-executor.ts)                                                                        |
| Act 진입·의도 분기                         | [Act start](../extension/src/service-worker/act-chat-start.ts), [intent router](../extension/src/service-worker/ask-act-intent-router.ts)                                                                                                                               |
| Act 실행 결과·목표 완료                    | [완료 계약](../extension/src/contracts/act-completion.ts), [관측 검사](../extension/src/service-worker/act-goal-observation.ts), [재판단](../extension/src/service-worker/act-goal-reassessment.ts), [최종 판단](../extension/src/service-worker/act-goal-finalizer.ts) |
| Act Provider schema·응답 처리              | [step runner](../extension/src/service-worker/act-step-runner.ts), [action schemas](../extension/src/service-worker/act-tools.ts), [Provider turn](../extension/src/service-worker/act-provider-turn.ts)                                                                |
| Act read schema·executor·결과 연결         | [harness turns](../extension/src/service-worker/act-harness-turns.ts), [executor registry](../extension/src/service-worker/act-read-tool-registry.ts), [execution inventory](../extension/src/service-worker/act-execution-inventory.ts)                                |
| 입력값·추가 질문                           | [value binding](../extension/src/page-act-harness/value-binding.ts), [value source](../extension/src/service-worker/act-value-source.ts), [clarification](../extension/src/service-worker/act-clarification.ts)                                                         |
| 계획 제출·승인·후속 turn                   | [plan schema](../extension/src/service-worker/act-plan-schema.ts), [plan store](../extension/src/service-worker/act-plan-store.ts), [plan turns](../extension/src/service-worker/act-plan-turns.ts)                                                                     |
| 실행 결과·목표 판단                        | [execution feedback](../extension/src/service-worker/act-execution-feedback.ts), [goal feedback](../extension/src/service-worker/act-goal-feedback.ts), [outcome](../extension/src/page-act-harness/outcome.ts)                                                         |

## 페이지와 데이터 읽기

| 영역                                 | 확인할 코드                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DOM/ARIA projection·대상 binding     | [content entry](../extension/src/content/entry.ts), [collector](../extension/src/content/semantic-collector.ts), [ref registry](../extension/src/content/ref-registry.ts)                                                                                                                                                                                                                  |
| 공통 분석 데이터 획득                | [acquisition](../extension/src/service-worker/analysis-data-acquisition.ts), [source selection](../extension/src/service-worker/analysis-source-selection.ts), [source consent](../extension/src/service-worker/source-consent.ts)                                                                                                                                                         |
| Collection reader 선택·수집          | [registry](../extension/src/service-worker/collection-reader-registry.ts), [orchestrator](../extension/src/service-worker/collection-read-orchestrator.ts), [readers](../extension/src/service-worker/readers)                                                                                                                                                                             |
| Script 목록·검색·부분 읽기           | [schemas](../extension/src/service-worker/page-resource-schemas.ts), [executor](../extension/src/service-worker/page-resource-tools.ts), [content resources](../extension/src/content/page-resources.ts)                                                                                                                                                                                   |
| 동적 Page Method 탐색·제안·실행      | [method contracts](../extension/src/contracts/page-method-types.ts), [MAIN discovery/invoker](../extension/src/service-worker/page-method-main.ts), [request-bound runner](../extension/src/service-worker/page-method-runner.ts), [proposal schema/parser](../extension/src/service-worker/act-tools.ts), [execution and return consent](../extension/src/service-worker/runtime-chat.ts) |
| Component·대체 읽기 채널·vision      | [schemas](../extension/src/service-worker/component-tool-schemas.ts), [executor](../extension/src/service-worker/component-tools.ts), [observation](../extension/src/content/component-observation.ts), [vision read](../extension/src/service-worker/act-vision-read.ts)                                                                                                                  |
| Page API discovery·등록 adapter·실행 | [discovery controller](../extension/src/page-api/discovery/discovery-controller.ts), [registry](../extension/src/page-api/registry.ts), [runner](../extension/src/service-worker/page-api-runner.ts), [read runner](../extension/src/service-worker/page-api-read-runner.ts)                                                                                                               |
| Screenshot·zoom                      | [vision capture](../extension/src/service-worker/vision-capture.ts), [Ask vision executor](../extension/src/service-worker/ask-vision-tool-executor.ts)                                                                                                                                                                                                                                    |

## Workflow와 Profile

| 영역                         | 확인할 코드                                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow 선언·catalog·선택   | [declaration validator](../extension/src/contracts/workflow.ts), [catalog runtime](../extension/src/service-worker/workflow-catalog-runtime.ts), [selection handler](../extension/src/service-worker/workflow-selection-message-handler.ts)                          |
| Workflow 원본 목록·읽기·검토 | [schemas](../extension/src/service-worker/workflow-resource-schemas.ts), [executor](../extension/src/service-worker/workflow-resource-tools.ts), [review](../extension/src/page-act-harness/workflow-review.ts)                                                      |
| Profile 응답·서명·replay     | [types](../extension/src/profile/profile-types.ts), [Resolver](../extension/src/profile/resolver.ts), [JWS](../extension/src/profile/jws.ts), [persistent replay](../extension/src/profile/persistent-profile-replay.ts)                                             |
| Profile-bound Business MCP   | [binding validator](../extension/src/profile/mcp-binding.ts), [call guard](../extension/src/profile/business-mcp-call-guard.ts), [client](../extension/src/profile/business-mcp-client.ts), [Ask tool bridge](../extension/src/service-worker/business-mcp-tools.ts) |

교차 저장소 계약을 바꾸기 전에는 [미해결 정렬 과제](platform-alignment.md)를 확인한다.
후속 계약안과 외부 서비스 계획은 현재 Browser의 wire 계약이나 배포 증거를 대체하지 않는다.

## 승인·실행·검증

| 경계                                | 확인할 코드                                                                                                                                                                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 로컬 권한·permission mode·계획 범위 | [permission manager](../extension/src/policy/permission-manager.ts), [modes](../extension/src/policy/permission-mode.ts), [plan scope](../extension/src/policy/plan-scope.ts)                                                                       |
| managed policy·Act의 인가           | [enterprise policy](../extension/src/policy/enterprise-policy.ts), [policy evidence](../extension/src/service-worker/act-policy-evidence.ts)                                                                                                        |
| 승인된 proposal 실행                | [proposal executor](../extension/src/service-worker/act-proposal-executor.ts), [mutation coordinator](../extension/src/state/mutation-coordinator.ts), [approval store](../extension/src/page-act-harness/approval-store.ts)                        |
| 대상 재검사·DOM/CDP dispatch        | [preflight](../extension/src/content/preflight.ts), [execution routing](../extension/src/service-worker/act-execution-runtime.ts), [content executor](../extension/src/content/executor.ts), [bounded CDP](../extension/src/cdp/bounded-adapter.ts) |
| 동작 결과 관찰·검증                 | [postcondition verifier](../extension/src/service-worker/act-postcondition-verifier.ts), [UI completion](../extension/src/content/ui-completion.ts), [proposal completion](../extension/src/service-worker/act-proposal-completion.ts)              |

## S25 built-in model roles

Settings and migration: [provider settings](../extension/src/settings/provider-settings.ts),
[private schema decoder](../extension/src/settings/provider-state.ts),
[role controls](../extension/src/settings/provider-role-controls.ts).
Native decisions: [Jev client](../extension/src/providers/jev-client.ts),
[question templates](../extension/src/providers/decision-questions.ts),
[response validation](../extension/src/providers/jev-response.ts).
Request lifetime: [model bindings](../extension/src/providers/model-bindings.ts),
[settings write invalidation](../extension/src/providers/provider-write-binding.ts),
[decision coordinator](../extension/src/providers/decision-coordinator.ts).
Worker judgments and disclosure: [decision entry](../extension/src/service-worker/model-decision.ts),
[Ask routing and answer review](../extension/src/service-worker/ask-model-decision.ts),
[Act judgment adapter](../extension/src/service-worker/act-model-judgment.ts),
[prepared-task review](../extension/src/service-worker/prepared-task-review.ts).
[Verification and limitations](evidence/s25-jev-routing-2026-10-14.md).

## Provider와 진단

Diagnostic build policy is defined in [privacy-mode](../extension/src/diagnostics/privacy-mode.ts):
development builds preserve captured values through [raw serialization](../extension/src/diagnostics/raw-trace.ts),
while release builds apply the existing masker. Commands and export fields are
documented in [method diagnostics](reference/method-execution-diagnostics.md#build-modes).

| 영역                                  | 확인할 코드                                                                                                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI 호환 Provider·설정·secret 쓰기 | [adapter resolver](../extension/src/providers/resolve-openai-compatible.ts), [settings](../extension/src/settings/provider-settings.ts), [secret write](../extension/src/settings/provider-secret-write.ts)                                                      |
| Provider 전송·wire·stream             | [runtime](../extension/src/providers/runtime.ts), [request](../extension/src/providers/provider-request.ts), [transport](../extension/src/providers/transport.ts), [offscreen bridge](../extension/src/service-worker/offscreen-provider-bridge.ts)              |
| 진단 수집·추적·마스킹·ZIP             | [diagnostics handler](../extension/src/service-worker/diagnostics-message-handler.ts), [trace](../extension/src/diagnostics/method-trace.ts), [mask](../extension/src/diagnostics/trace-mask.ts), [Panel export](../extension/src/sidepanel/diagnostics-view.ts) |
| 선택적 evidence 전송                  | [runtime evidence](../extension/src/service-worker/runtime-evidence.ts), [audit contract](../extension/src/security/audit.ts)                                                                                                                                    |
| 빌드·추적 coverage·패키지             | [build](../scripts/build-extension.mjs), [coverage checker](../scripts/check-method-trace-coverage.mjs), [package validation](../scripts/validate-package.mjs), [release smoke](../scripts/release-smoke.mjs)                                                    |

검증 명령은 [test.md](test.md), 결과의 revision·환경·미검증 범위는
[evidence](evidence/README.md)에서 확인한다.

S21 추가 판단은 [element turn](../extension/src/service-worker/act-element-assessment-turn.ts),
[action assessment](../extension/src/service-worker/act-action-assessment.ts),
[관찰·freshness](../extension/src/service-worker/act-assessment-observation.ts),
[공유 budget](../extension/src/service-worker/act-assessment-budget.ts),
[논리 단계](../extension/src/service-worker/act-logical-results.ts),
[중복 mutation 차단](../extension/src/service-worker/act-mutation-history.ts),
[컨트롤 capability](../extension/src/content/control-capability.ts)에서 확인한다.

Provider의 최종 completed 수용은 [goal finalizer](../extension/src/service-worker/act-goal-finalizer.ts),
[completion 계약](../extension/src/contracts/act-completion.ts), [완료 표시](../extension/src/sidepanel/act-completion-view.ts)에서 확인한다.
로컬 이동 UNKNOWN의 목적지 결합 확인은 [navigation confirmation](../extension/src/service-worker/act-navigation-confirmation.ts)과
[ISS-20261011-004](issues/records/2026-10-11-navigation-provider-confirmation.md)에서 확인한다.

동적 Page Method의 함수/receiver identity는 [MAIN registry](../extension/src/service-worker/page-method-registry-main.ts),
정확한 계획·인수 결속은 [plan binding](../extension/src/service-worker/page-method-plan.ts),
반환 privacy/크기는 [return projection](../extension/src/service-worker/page-method-return-data.ts)에서 확인한다.

수동 “Page API 힌트 검색” 버튼과 후보 검토 창은 제거됐다. Act의 동적 Page Method
탐색·호출은 별도 경로로 유지한다. Discovery controller/scanner는
[분석 API 가용성 확인](../extension/src/service-worker/analysis-api-availability.ts)에서
계속 사용하며, 후보 자체는 실행 권한이 아니다.

수동 “페이지 데이터 읽기” 버튼과 COLLECTION_DISCOVER/READ 전용 패널 경로도
제거됐다. Ask/Act 분석 및 Component 도구의 collection 발견·reader·orchestrator는
유지한다. `pnpm test:chrome-collection`은 수동 UI 부재와 폐기된 메시지 거부를,
`pnpm test:chrome-analysis-data`는 유지된 Ask/Act 분석 경로를 검증한다.

## Options source navigation

[Settings entry](../extension/src/settings/entry.ts) initializes the
[navigation](../extension/src/settings/settings-navigation.ts),
[Provider management](../extension/src/settings/provider-management.ts),
[Provider form](../extension/src/settings/provider-form-save.ts),
[role-to-form selection](../extension/src/settings/provider-editors.ts),
[agent preferences](../extension/src/settings/agent-preferences-form.ts),
[Chrome permissions](../extension/src/settings/settings-permissions.ts),
[workflow list](../extension/src/settings/workflow-settings.ts) and
[enterprise resolver form](../extension/src/settings/resolver-form.ts).
[Options HTML](../extension/src/settings/index.html) includes focused HTML fragments
at build time through [the extension builder](../scripts/build-extension.mjs).
Use `pnpm test:chrome-options` with `CHROME_FOR_TESTING_BIN` for the controlled UI
regression; [dated evidence](evidence/options-ux-2026-10-18.md) records its scope.
