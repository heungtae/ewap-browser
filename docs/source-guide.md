# 코드 탐색 안내

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

| 경로                                       | 확인할 코드                                                                                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask의 Provider 요청·tool 결과 continuation | [Ask runner](../extension/src/service-worker/ask-chat-runner.ts), [read schemas](../extension/src/service-worker/ask-tools.ts), [executor](../extension/src/service-worker/ask-tool-executor.ts)                                         |
| Act 진입·의도 분기                         | [Act start](../extension/src/service-worker/act-chat-start.ts), [intent router](../extension/src/service-worker/ask-act-intent-router.ts)                                                                                                |
| Act Provider schema·응답 처리              | [step runner](../extension/src/service-worker/act-step-runner.ts), [action schemas](../extension/src/service-worker/act-tools.ts), [Provider turn](../extension/src/service-worker/act-provider-turn.ts)                                 |
| Act read schema·executor·결과 연결         | [harness turns](../extension/src/service-worker/act-harness-turns.ts), [executor registry](../extension/src/service-worker/act-read-tool-registry.ts), [execution inventory](../extension/src/service-worker/act-execution-inventory.ts) |
| 입력값·추가 질문                           | [value binding](../extension/src/page-act-harness/value-binding.ts), [value source](../extension/src/service-worker/act-value-source.ts), [clarification](../extension/src/service-worker/act-clarification.ts)                          |
| 계획 제출·승인·후속 turn                   | [plan schema](../extension/src/service-worker/act-plan-schema.ts), [plan store](../extension/src/service-worker/act-plan-store.ts), [plan turns](../extension/src/service-worker/act-plan-turns.ts)                                      |
| 실행 결과·목표 판단                        | [execution feedback](../extension/src/service-worker/act-execution-feedback.ts), [goal feedback](../extension/src/service-worker/act-goal-feedback.ts), [outcome](../extension/src/page-act-harness/outcome.ts)                          |

## 페이지와 데이터 읽기

| 영역                                 | 확인할 코드                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOM/ARIA projection·대상 binding     | [content entry](../extension/src/content/entry.ts), [collector](../extension/src/content/semantic-collector.ts), [ref registry](../extension/src/content/ref-registry.ts)                                                                                                    |
| 공통 분석 데이터 획득                | [acquisition](../extension/src/service-worker/analysis-data-acquisition.ts), [source selection](../extension/src/service-worker/analysis-source-selection.ts), [source consent](../extension/src/service-worker/source-consent.ts)                                           |
| Collection reader 선택·수집          | [registry](../extension/src/service-worker/collection-reader-registry.ts), [orchestrator](../extension/src/service-worker/collection-read-orchestrator.ts), [readers](../extension/src/service-worker/readers)                                                               |
| Script 목록·검색·부분 읽기           | [schemas](../extension/src/service-worker/page-resource-schemas.ts), [executor](../extension/src/service-worker/page-resource-tools.ts), [content resources](../extension/src/content/page-resources.ts)                                                                     |
| Component·대체 읽기 채널·vision      | [schemas](../extension/src/service-worker/component-tool-schemas.ts), [executor](../extension/src/service-worker/component-tools.ts), [observation](../extension/src/content/component-observation.ts), [vision read](../extension/src/service-worker/act-vision-read.ts)    |
| Page API discovery·등록 adapter·실행 | [discovery controller](../extension/src/page-api/discovery/discovery-controller.ts), [registry](../extension/src/page-api/registry.ts), [runner](../extension/src/service-worker/page-api-runner.ts), [read runner](../extension/src/service-worker/page-api-read-runner.ts) |
| Screenshot·zoom                      | [vision capture](../extension/src/service-worker/vision-capture.ts), [Ask vision executor](../extension/src/service-worker/ask-vision-tool-executor.ts)                                                                                                                      |

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

## Provider와 진단

| 영역                             | 확인할 코드                                                                                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider plugin·설정·secret 쓰기 | [manifest validator](../extension/src/providers/manifest.ts), [registry](../extension/src/providers/registry.ts), [secret write](../extension/src/settings/provider-secret-write.ts)                                                                             |
| Provider 전송·wire·stream        | [runtime](../extension/src/providers/runtime.ts), [request](../extension/src/providers/provider-request.ts), [transport](../extension/src/providers/transport.ts), [offscreen bridge](../extension/src/service-worker/offscreen-provider-bridge.ts)              |
| 진단 수집·추적·마스킹·ZIP        | [diagnostics handler](../extension/src/service-worker/diagnostics-message-handler.ts), [trace](../extension/src/diagnostics/method-trace.ts), [mask](../extension/src/diagnostics/trace-mask.ts), [Panel export](../extension/src/sidepanel/diagnostics-view.ts) |
| 선택적 evidence 전송             | [runtime evidence](../extension/src/service-worker/runtime-evidence.ts), [audit contract](../extension/src/security/audit.ts)                                                                                                                                    |
| 빌드·추적 coverage·패키지        | [build](../scripts/build-extension.mjs), [coverage checker](../scripts/check-method-trace-coverage.mjs), [package validation](../scripts/validate-package.mjs), [release smoke](../scripts/release-smoke.mjs)                                                    |

검증 명령은 [test.md](test.md), 결과의 revision·환경·미검증 범위는
[evidence](evidence/README.md)에서 확인한다.
