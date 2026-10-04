# 현재 페이지 Act Harness 기존 문서 동기화 검토 목록

- 작성일: 2026-10-04
- 상태: Review pending. 기존 문서의 수정·이동·삭제·상태 변경은 수행하지 않았다.
- 기준: [신규 상세 설계](page-act-context-harness-design.md), [신규 Sprint 계획](sprint-page-act-context-harness-plan.md)
- 사용자 지시: 현재 구현과 방향이 다를 수 있으므로 목록만 정리하고, 확인 후 동기화한다.

## 1. 검토 방법과 범위

Browser 문서의 현행 내용과 관련 service-worker/content/contracts 코드를 확인해
새 방향과 충돌하거나 연결이 필요한 항목을 정리했다. 파일 전체를 다시 쓰라는 목록이
아니며, 아래의 구체 항목과 적용 시점을 사용자 확인 후 확정한다.

이 목록에서 현재 구현 설명은 구현 변경 전까지 AS-IS로 유지한다. 제안 설계는
TO-BE로 표시할 수 있지만 이미 구현된 것으로 상태를 올리지 않는다. 검증 문서는
과거 결과와 신규 결과를 구분하고 통제 Provider PASS를 live 추론 성공으로 바꾸지 않는다.

직접 동기화 검토 대상은 29개이며, 구현 세부에 따라 확인할 조건부 대상은 13개다.
workspace/Platform 문서는 별도의 외부 계약 영향 후보이며 자동 수정 대상이 아니다.
신규 문서 3개는 이 기존 문서 수에 포함하지 않는다.

## 2. 상세 설계와 연결할 문서 — 10개

| ID | 문서 | 확인한 항목·충돌 | 검토할 변경 | 시점 |
| --- | --- | --- | --- | --- |
| D01 | [21. 선언형 Workflow](21-declarative-act-workflow-design.md) | 전용 MIME 선언이 순서·분기 기준이며 후보를 사용자가 고르면 모델은 시작을 판단하지 않음. 활성 step으로 도구 축소 | 세 출처·페이지 선언의 입력 자료화·LLM 적합성/추가 읽기·원본과 새 초안·선택 후 재검토 | 설계 확인 후 TO-BE 추가, 실제 AS-IS는 PAH-5~6 이후 |
| D02 | [22. Page Profile 공급](22-page-profile-provider-design.md) | 공급·서명·현재 매핑 설명과 workflow 소비 경계 | 무결성과 요청 적합성 분리, Profile 정의의 추가 읽기·모델 검토. 현행 resolver와 향후 MCP 공급 구분 | PAH-0 계약 검토, PAH-5 구현 증거 이후 |
| D03 | [32. Ask/Act 분석 수집](32-ask-act-analysis-data-acquisition-design.md) | 현재 bounded source 선택·collection/API 연결을 설명 | 초기 inventory·coverage, 모델의 발견/읽기 선택, read result continuation. 기존 정책 거부와 의미 선별 분리 | 설계 확인 후 제안 구분, PAH-3~4 이후 구현 갱신 |
| D04 | [28. Collection Reading](28-collection-reading-strategy-design.md) | 객체 종류·요청 범위 판정 및 고정 읽기 경로 | component descriptor와 가용 채널·EOF·복구 힌트, LLM의 자료/범위 선택. 기존 reader 권한 유지 | PAH-4 이후 |
| D05 | [29. Page API Discovery](29-page-api-discovery-design.md) | fixed scanner candidate의 모델 전달 금지, dispatcher 시작 조건 | 신규 source 읽기와 비공개 scanner의 분리 명시. LLM에 arbitrary API 호출을 허용하는 식으로 변경하지 않음 | PAH-2 경계 검토 이후 |
| D06 | [13. 사이트 도구·모델 계약](13-site-tool-contract.md) | 현재 read/propose 도구와 discovery 우선 경로, 단일 결과 enum | 신규 inventory/resource/workflow/component 도구·phase별 schema, read round-trip, answer/action/goal 결과와 migration | PAH-0 제안 계약, PAH-3~6 구현 이후 |
| D07 | [17. 브라우저 기능 채택](17-claude-browser-capability-adoption-design.md) | 읽기·Act·chat이 별도 기능 축으로 기술됨 | 최초 context→추가 읽기→계획→승인→실행→재관찰 흐름. 기존 권한·vision 한계와 연결 | PAH-1~6 이후 |
| D08 | [19. 탭별 Chat 문맥](19-tab-scoped-chat-session-design.md) | history/compaction/session 저장·target binding | evidence ID·coverage·plan/request revision·continuation·승인 경계의 압축/복구 규칙 | PAH-3, PAH-7 이후 |
| D09 | [04. LLM provider plugin](04-llm-provider-plugin.md) | transport/실행 경계와 provider lifecycle | 반복 function tool call/result 호환 범위·tool ID 검증·취소·지원 불가 응답 규칙 | PAH-3 이후 |
| D10 | [06. 감사·개인정보](06-data-audit-and-privacy.md) | 현행 저장 수명·별도 코드 분석·terminal audit enum | source/chunk 동의·egress·masking metadata·raw source 비저장·내부 결과와 외부 audit migration | PAH-2, PAH-6~7 이후 |

D05는 현재 scanner의 금지 경계를 해제하자는 항목이 아니다. 신규 읽기 자료를
별도 계약으로 제공하는 것과 기존 실행 후보를 모델에 공개하는 것을 구분하는 정리다.
D02 역시 Page Profile을 표준 MCP로 이미 공급한다고 기술하는 변경이 아니다.

## 3. 현재 구현·실행 결과·진단 문서 — 7개

| ID | 문서 | 확인한 항목·충돌 | 검토할 변경 | 시점 |
| --- | --- | --- | --- | --- |
| D11 | [31. Act 현재 구현](31-act-request-execution-current-implementation.md) | method/route inventory, 후보 발견→선택→step 도구, 현재 provider 입력 | 실제 bootstrap/read loop/review/plan/dispatch/verify 경로와 method 목록. 현재 제한은 구현 전 삭제하지 않음 | 해당 구현 이후 AS-IS 재검증 |
| D12 | [33. Ask 현재 구현](33-ask-request-execution-current-implementation.md) | 최초 입력·read tool turn·source·egress·진단 | 공통 read infrastructure 재사용으로 달라지는 method/입력/오류와 Ask read-only 유지 | PAH-1~3, PAH-7 이후 |
| D13 | [24. liveness·진단](24-act-liveness-and-diagnostics-design.md) | 대기 상태·deadline·worker restart·실행 추적 | READING/REASONING/PLAN_REVIEW 등 신규 상태, 취소·tool continuation·budget·parent event correlation | PAH-3, PAH-7 이후 |
| D14 | [25. 완료 조건](25-act-completion-conditions.md) | action postcondition과 종료 처리 | 설명 완료·개별 동작·최종 목표 구분, 검증 실패/unknown/incomplete, unsupported 단계 생략 금지 | PAH-6 이후 |
| D15 | [26. 결과 관찰](26-act-result-observation-design.md) | 화면 갱신·비동기 관찰과 verifier | 사후 evidence를 모델에 반환하고 재계획/목표 점검. typed verifier와 모델 판정의 책임 분리 | PAH-6 이후 |
| D16 | [30. 진단 다운로드](30-diagnostics-download-design.md) | request-bound ZIP·LLM/page/diagnostic 수집 | offered tools·read/evidence/plan revision·coverage·마스킹·drop count와 결과 구분 | PAH-7 이후 |
| D17 | [method 진단](reference/method-execution-diagnostics.md) | 빌드 계측·debug/trace·현재 masking 및 answer-only reason | 신규/변경 method 전체의 실제 진입/반환/오류/취소, read→provider→review→verify 상관관계 | 각 Sprint 및 PAH-7 종합 검증 이후 |

31·33번은 설계를 선반영해 현재 구현인 것처럼 바꾸지 않는다. 24~26번의 Proposed/
Partial 상태도 이번 신규 문서 작성으로 완료 처리하지 않는다. method instrumentation이
새 runtime 모듈에도 적용되는지 실제 build/trace를 확인한 후 D17을 갱신한다.

## 4. Examples의 설명·요청·검증 문서 — 5개

| ID | 문서 | 확인한 항목·충돌 | 검토할 변경 | 시점 |
| --- | --- | --- | --- | --- |
| D18 | [16. Accessible demo](16-accessible-items-demo.md) | 전용 declaration을 사용하는 Preview 설명 | 보이는 설명·실제 handler를 읽는 일반 페이지 예제. legacy fixture가 필요하면 별도 구분 | PAH-5 example/test 전환과 함께 |
| D19 | [예제 요청 메시지](../examples/example-request-messages.md) | 입력 card 기대 동작·Preview 요청·선언 의존 기대 경로 | 원래 요청·추가 읽기·적합성 검토·계획/값 승인·실제 완료 기대값. 1/2/3 예제 순서 유지 | PAH-5~6 구현 뒤 사용자 확인 |
| D20 | [Chrome 테스트 안내](../examples/chrome-request-tests.md) | 실제 Chrome + 통제 Provider, 36개 요청, 정해진 경로 | context/read-loop/무관 후보 선택/live/holdout 검증 분리. 일반 실행 자동 선택의 범위 명시 | PAH-3~8 증거와 함께 |
| D21 | [Chrome 결과](../examples/chrome-request-test-results.md) | 2026-10-04, 0.1.90, 통제 Provider의 36/36 | 당시 결과는 보존. 신규 보고서 참조와 통제 경로·모델 추론·workflow 선택 미검증의 범위 보완 | 실제 신규 검증 이후. 과거 PASS 삭제·재해석 금지 |
| D22 | `examples/workflow-review-direction.md` (기존 미추적 초안) | 세 출처 통합은 맞지만 후보 검토 중심의 구현 순서. 새 문맥 harness보다 앞선 초안 | 상세 설계 참조, 초기 context/발견/추가 읽기 우선 순서로 정렬하거나 역사 초안 보존 여부 결정 | 사용자 확인 후. 현재 untracked 파일 그대로 유지 |

예제 HTML과 테스트 스크립트의 변경 검토 대상도 연결해서 기록한다. 아래는 문서가
아니므로 위 29개 수에 포함하지 않는다. 이번 작업에서 코드를 수정하지 않는다.

- `examples/accessible-items-demo/index.html`: 기존 ContextPilot 전용 workflow JSON을
  일반 설명으로 전환하고 실제 event handler를 유지하는 후보.
- `package.json`의 `test:chrome-example-requests` 진입점과 그 연결 테스트 코드:
  선언 의존성, 통제 Provider 응답, 일반 경로 자동 선택·판정 범위를 실제 전환 때 함께 확인.
- `extension/src/content/entry.ts` 및 workflow catalog/source analysis/runtime:
  일반 페이지 자료 발견과 독립 page-declared 실행 후보 처리의 전환 검토.

선언만 먼저 삭제하여 테스트를 깨뜨리지 않는다. 읽기·검토·계획 구현과 예제·테스트를
같은 전환 범위로 다룬다. 새 코드에 페이지명·요청 문구·fixture handler를 넣어 통과시키지 않는다.

## 5. 인덱스·Sprint·검증 기준 — 7개

| ID | 문서 | 검토할 변경 | 시점 |
| --- | --- | --- | --- |
| D23 | [문서 인덱스](README.md) | 새 설계/PAH Sprint/검토 목록 링크와 AS-IS/TO-BE 상태 일치. 기존 28·29·32 상태 label도 근거와 비교 | 사용자 확인 후 |
| D24 | [기존 Sprint 설계](sprint-design.md) | PAH 계획 참조와 legacy S0~S14 관계. 기존 완료 기록은 보존 | 사용자 확인 후 |
| D25 | [기존 Sprint 개발 계획](sprint-development-plan.md) | 새 작업의 의존성·범위 연결. 이전 완료 Sprint를 Planned로 되돌리지 않음 | 사용자 확인 후 |
| D26 | [기존 Sprint 검증 계획](sprint-verification-plan.md) | controlled/live/holdout/공유 계약 검증의 차이와 PAH matrix 참조 | 사용자 확인 후 |
| D27 | [기존 Sprint 진행](sprint-progress.md) | 새 PAH 작업을 모두 Planned로 등록하고 구현 증거가 생길 때만 상태 변경 | 사용자 확인 후 |
| D28 | [07. 검증·출시](07-verification-and-release.md) | 문맥 읽기·무관 workflow·도구 없는 답변·goal verification·live/holdout release gate | PAH-8 검증 방식 확정 후 |
| D29 | [18. 브라우저 검증계획](18-claude-browser-capability-verification-plan.md) | 초기 문맥→추가 읽기→계획과 component/read round-trip·완료 판정 회귀 추가 | PAH-1~8 시나리오 확정 후 |

관리 문서에 새 링크만 넣는 변경도 사용자 확인 전에는 하지 않는다.
과거 Sprint 명칭을 PAH로 바꾸거나 이번 설계 작성 사실을 구현 완료 ledger로 올리지 않는다.

## 6. 구현 범위에 따른 조건부 확인 — 13개

아래 문서는 새 기능과 인접하지만 전체 수정 필요성을 아직 확정하지 않는다.
기존 경계가 그대로 유지되면 참조 추가 또는 변경 없음으로 처리할 수 있다.

| ID | 문서 | 변경 여부를 판단할 조건 |
| --- | --- | --- |
| C01 | [01. 아키텍처](01-architecture.md) | bootstrap/read-loop/plan/evidence를 아키텍처의 새 공통 구성으로 넣는지 |
| C02 | [01. 아키텍처 중복 파일](01-architecture%281%29.md) | 독립 참조 여부와 역사 사본 역할. 자동 삭제/동시 수정하지 않고 정본·보존 여부 확인 |
| C03 | [02. 보안 정책](02-security-policy.md) | source 전달 동의·새 read capability·vision 개인정보·plan approval의 실제 정책 변경 여부 |
| C04 | [03. 확장 설계](03-extension-design.md) | worker/content/provider message·storage·module 구성 변화 여부 |
| C05 | [12. 구현 실행 명세](12-low-cost-agent-implementation-spec.md) | 단일 제안 중심 실행 절차와 신규 read→plan loop의 정렬 필요 여부 |
| C06 | [14. Semantic Projection](14-semantic-projection-fingerprint.md) | UI observation과 source evidence의 별도 경계를 명확히 해야 하는지. source를 projection에 삽입하지 않음 |
| C07 | [15. CDP adapter](15-bounded-cdp-adapter.md) | 실제 executor/vision 계약이 바뀌는지. 임의 JS·raw coordinate 금지는 유지 |
| C08 | [20. 안정성 리팩터링](20-stability-refactoring-design.md) | 공통 read runner/evidence store의 module 소유와 기존 작업 계획 관계 |
| C09 | [23. worker composition](23-service-worker-composition-refactoring-plan.md) | 신규 orchestrator를 연결하는 composition 책임·dependency 구성 변화 |
| C10 | [27. Page API 실행](27-page-api-execution-design.md) | reviewed adapter를 계획 단계에서 선택하는 연결과 capability 오류 처리. 임의 함수 실행으로 확장하지 않음 |
| C11 | [Platform 정렬](platform-alignment.md) | 외부 resource/storage/outcome 계약이 실제 바뀌거나 새 compatibility 항목이 필요한지 |
| C12 | [Enterprise 작업 계획](CODEX-CLI-ENTERPRISE-ALIGNMENT-TASK-PLAN.md) | PAH의 Browser-local 작업과 실제 Platform 연동 작업을 연결해야 하는지 |
| C13 | [05. 배포·운영](05-deployment-operations.md) | opt-in 전환·artifact 표시·rollback·신규 운영 설정이 출시 범위에 들어가는지 |

## 7. workspace/Platform의 조건부 검토

현재 workspace spec과 양쪽 자료를 확인했지만 이번에는 외부 계약을 바꾸지 않는다.
다음은 영향이 생길 때 별도 저장소 작업으로 검토할 항목이다.

| 저장소 | 파일/영역 | 검토를 시작하는 조건 | 순서 |
| --- | --- | --- | --- |
| workspace | `specs/workflow.schema.json` | 새 외부 step/계획/원본 참조가 공유 Workflow 의미를 바꾸는 경우 | producer/consumer 확인→계약·version/migration→검증 |
| workspace | `specs/page-profile.schema.json` | 서버 공급 문서·workflow review 자료에 신규 외부 필드가 필요한 경우 | 계약 먼저, Browser 내부 필드를 그대로 wire에 추가하지 않음 |
| workspace | contract validation/compatibility/integration 영역 | 새 wire 버전·전환·공급 경로가 생기는 경우 | 제품별 변경 이후 통합·backward compatibility |
| Platform | `docs/aidlc/contracts/resource-api.md` | Profile/workflow resource 제공·버전·동결·서명과 새 소비 요구가 연결되는 경우 | workspace 계약 확인 후 서버 producer 검토 |
| Platform | `docs/aidlc/modules/workflow-designer.md`, `modules/workflow-designer/` 문서 | 원본과 모델 변경 초안의 authoring/review/release 경계가 서버 기능에 영향을 주는 경우 | 필요한 Platform 구현·테스트와 함께 갱신 |

Browser 내부 harness만 바뀌면 위 문서를 자동 동기화하지 않는다. 반대로 외부 계약을
바꾸면 Browser 테스트만으로 완료하지 않는다. 공유 `ewap/v1`, Browser local declaration,
Platform target WorkflowDefinition을 하나의 동일 schema로 취급하지 않는다.

## 8. 과거 기록의 보존

`docs/evidence/`의 과거 Chrome·Sprint 종료 기록과 기존 결과 문서는 당시 실행의 증거다.
이번 방향에 맞춰 과거 PASS를 수정하거나 새 일반화 성공으로 확대하지 않는다.
필요한 보완은 검증 범위의 주석·새 보고서 참조 방식으로 사용자 확인 후 진행한다.

특히 2026-10-04 통제 Provider의 36/36은 지정한 Chrome UI·executor 경로의 결과다.
현재의 workflow 적합성·모델 추가 읽기·새 페이지 추론을 검증한 결과는 아니다.
새 구현은 새 revision과 새 실행 보고서를 만들어야 한다.

## 9. 확인 후 동기화할 순서

사용자 확인 시 D01~D29와 C01~C13 중 대상·항목·적용 시점을 확정한다.
확인 이후에도 설계 방향 합의와 구현 완료를 구분해서 다음 순서로 진행한다.

1. 상세 설계의 미확정 계약·privacy·outcome 항목을 확정하고 필요한 TO-BE 참조를 추가.
2. 공유 계약 영향이 있으면 workspace 계약과 compatibility 전략을 먼저 검증.
3. Sprint별 실제 구현·검증 뒤 31·33 및 method/완료/관찰의 AS-IS 내용을 갱신.
4. example 설명·요청·테스트를 함께 전환하고 과거 결과와 신규 evidence를 분리.
5. 인덱스·Sprint ledger·출시 기준에 실제 상태와 미검증 범위를 반영.

현재는 이 목록과 신규 설계/Sprint 문서만 작성했다. 기존 문서 동기화, duplicate 문서
삭제, example 선언 삭제, 코드·공유 schema·Platform 변경은 모두 미수행이다.
