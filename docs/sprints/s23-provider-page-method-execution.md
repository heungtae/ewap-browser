# Browser Act S23 — Provider의 페이지 스크립트 분석과 메서드 호출

## 상태와 착수 근거

**Completed — 2026-10-12, Browser-local 지원 범위.**
구현 보강·통제 Chrome 회귀·실제 OpenRouter 데이터 holdout 및 OpenAI `gpt-6-luna`
독립 UI/수동 승인 qualification이 통과했다. 최초 429/503 실패는 보존한다.
[리뷰 후 증거와 수용 범위](../evidence/s23-page-method-review-2026-10-12.md)를 참조한다.
운영 사이트·임의 모델·회사/Platform·설치/배포는 별도 backlog이며 이 완료 판정에 포함하지 않는다.

사용자는 사이트별 adapter를 작성하는 방식 대신, 페이지 script를 Provider가 읽고
필요한 메서드와 인자를 판단하면 확장이 호출하고 결과를 같은 대화에 반환하도록 요청했다.
설계 검토 후 기존 Sprint와 충돌하는 조건을 이 신규 Sprint에 기록한다.

| 항목          | 내용                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| 대조 revision | `c83c8ff690936234ef5a67f18de37005ef58aa64`, 확장 `0.1.106`                         |
| 확인 범위     | 기존 Sprint 목록·진행 기록, S10/Discovery·S16~S22 및 관련 승인·분석·실행 계약      |
| 현재 기반     | script 목록·검색·부분 읽기, Act 계획·승인·실행 결과 반환, request/document binding |
| 신규 범위     | Browser-local Act의 동적 메서드 확인·호출 제안·실행·반환 데이터 전송·후속 판단     |
| 구현 기준점   | 현재 변경 중인 작업 트리; HEAD `6da726b4b`, 0.1.106 |
| 상태의 의미   | Completed. 명시한 Browser-local 범위의 통제·live holdout/UI PASS           |

현재 동작은 [코드 탐색 안내](../source-guide.md)와 코드·계약·설정이 SSOT다.
기존 Completed 기록은 당시 revision과 검증 범위로 보존한다. 이 계획으로 과거의
금지 조건이나 검증 결과를 소급 변경하지 않는다. 아래 도구·필드 이름은 제안이며
C1에서 실제 TypeScript·Provider schema·parser·executor 계약으로 확정한다.

## 기존 Sprint와의 충돌 및 전환 작업

직접 충돌, 새 경로에 필요한 확장, 계속 유지할 경계를 구분한다. 기존 문서의
계획·완료 상태를 고쳐 새 기능이 이미 지원된 것처럼 표현하지 않는다.

| ID  | 기존 Sprint의 조건과 현재 근거                                                                                                                                                                                                                    | S23과의 관계·처리                                                                                                                                                                                                                                                                                                                                                                                                          | 담당 카드·검증             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| X01 | [S10/Discovery](s10-page-api-discovery-handoff.md): C4·구현 범위 5·완료 조건에서 후보를 callable tool/Provider context로 보내지 않고 adapter 없는 후보는 `REQUIRES_ADAPTER_REVIEW`; raw function path·return object 비전송                        | 직접 충돌. 동의된 메서드 설명과 검증된 요청 한정 참조를 Provider에 제공하는 새 경로를 추가한다. 사이트별 adapter 등록을 선행 조건으로 두지 않는다. 원시 페이지 객체·비밀 URL·무제한 소스/반환값 비전송은 유지한다. 기존 힌트 dialog의 역할·표시 전환을 C6에서 함께 결정한다                                                                                                                                                | C1/C2/C6, R01/R03/R13/R19  |
| X02 | [S16](s16-page-script-tool-loop.md): script는 정적 읽기 자료이며 함수 실행·endpoint 호출 권한을 제공하지 않음                                                                                                                                     | 읽기 권한 경계는 유지. 소스 근거로 별도의 메서드 확인·호출 제안을 시작할 수 있게 확장한다. 읽기 성공·함수 발견을 실행 승인으로 사용하지 않는다. 기존 pagination·동의·coverage·마스킹 회귀를 유지한다                                                                                                                                                                                                                       | C2/C3, R01/R02/R09         |
| X03 | [S17](s17-act-plan-execution-feedback.md): C2는 등록 API inventory, R1은 미등록 함수 호출 0건; [plan schema](../../extension/src/service-worker/act-plan-schema.ts)는 고정 capability와 문자열 입력 중심                                          | 등록 adapter만 호출 가능한 조건과 직접 충돌. 실제 executor가 연결된 동적 참조를 inventory·plan·proposal에 포함한다. JSON 인자와 계획/호출 revision 결속을 확장하며 함수/endpoint의 자동 adapter 등록은 만들지 않는다. 기존 등록 API는 호환 회귀로 유지한다                                                                                                                                                                 | C3/C4/C6, R01/R07/R08/R20  |
| X04 | [S20](s20-act-tool-loop-live-qualification.md): R3은 등록 API 대응 또는 실행 수단 없음, 임의 함수 호출 없음                                                                                                                                       | 기존 qualification의 지원 범위를 넘어선다. 새 capability에 대한 schema→call→실제 실행→동일 call ID 결과→다음 판단을 S23에서 다시 검증한다. 기존 S20 PASS를 새 호출의 증거로 재사용하지 않는다                                                                                                                                                                                                                              | C8, R01/R18/R20            |
| X05 | [S13 분석 수집](s13-ask-act-analysis-data-acquisition.md)의 reviewed read-only adapter와 `REQUIRES_ADAPTER_REVIEW`; [S19](s19-component-data-tools.md)의 내부 상태·임의 함수 비읽기                                                               | 기존 reader에는 계속 적용. 동적 메서드 호출은 별도 Act 실행 경로다. 이름이 get/read라는 이유로 Ask 또는 `read_component_data`의 안전한 읽기로 분류하지 않는다. 반환 데이터의 total/EOF/coverage를 추측하지 않는다                                                                                                                                                                                                          | C3/C5/C7, R05/R09/R17      |
| X06 | [S2](s2-deterministic-mutation-foundation.md)의 bounded CDP DOM/Input allowlist, [S7](s7-generic-browser-act.md)의 서명 실패 시 action 차단·좁은 R1 fallback, [S8](s8-permission-modes-hardening.md)의 hard policy                                | 제한된 새 실행 capability를 명시해야 한다. 기존 DOM/CDP fallback에 임의 함수 호출을 섞지 않고 Profile/Resolver 실패를 우회하지 않는다. 별도 JavaScript/Runtime CDP 권한 확장을 승인된 것으로 간주하지 않는다. 현재 API를 [generic R1](../../extension/src/service-worker/act-proposal-executor.ts)로 고정하는 처리는 동적 호출에 재사용하지 않는다                                                                         | C1/C3/C4, R05/R06/R14      |
| X07 | [S10-R](s10-r-page-api-request-cancellation.md)의 원래 request ID/generation 고정·각 await 뒤 재검사·dispatch 뒤 no-retry                                                                                                                         | 충돌 없음, 필수 보존. 동적 참조와 dispatch marker에도 원래 요청 소유권을 적용한다. timeout·Stop·restart가 이미 시작된 메서드를 되돌리거나 중지했다는 보장을 만들지 않는다                                                                                                                                                                                                                                                  | C4, R10/R11/R12            |
| X08 | [S15/PAH-9](s15-pah-9-llm-input-value-binding.md)의 정확한 값·request revision·정정 시 기존 승인 폐기                                                                                                                                             | 동적 JSON 인자 전체로 확장. 인자·메서드·계획이 바뀌면 기존 승인을 재사용하지 않는다. 입력 누락은 clarification으로 처리하며 Provider가 기본값을 추측 적용하지 않는다. raw 인자를 trace/history/ZIP에 저장하지 않는다                                                                                                                                                                                                       | C3/C6, R07/R08/R13         |
| X09 | [S21](s21-act-evidence-based-llm-assessment.md)의 기존 primitives/등록 API 한정, local UI 증거와 authoritative 업무 결과 구분; [feedback](../../extension/src/service-worker/act-execution-feedback.ts)의 `ok`→VERIFIED와 미확인 뒤 feedback-only | 신규 실행 수단으로 확장. 정상 반환을 action VERIFIED로 자동 매핑하지 않는다. 호출·반환·직렬화·관찰·action/goal 판단을 분리한다. 미확인 뒤 관찰은 허용하되 같은 논리 호출의 mutation 재실행은 금지한다. 서버 업무 성공은 별도 근거가 필요하다                                                                                                                                                                               | C4/C7, R11/R15/R16         |
| X10 | [S22](s22-unified-approval-policy.md)의 전체 category·Full Permission·revision/설정 변경 취소; [approval policy](../../extension/src/policy/approval-policy.ts)는 version 1·7개 category의 strict schema                                          | 실행 승인은 기존 action/plan/tool/risk category와 연결한다. 런타임 반환 데이터 전송은 코드 전송 동의와 구분해 신규 category·UI·version/migration을 함께 확정한다. Full Permission의 유효 신규 항목은 자동 승인, custom의 미설정 신규 항목은 확인이며 기존 deny를 보존한다. 기존 데이터가 INVALID_ARGUMENT로 탈락하는 단순 enum 추가는 금지한다. 과거 문서의 `component_scroll` 대신 현재 `scroll_read`를 기준으로 대조한다 | C5/C6, R06/R09/R13/R14/R19 |
| X11 | [S18](s18-workflow-resource-tools.md)의 원본 보존·request-local 초안, [S12 managed policy](s12-managed-policy-boundary.md)의 PDP/로컬 교집합                                                                                                      | 저장·서명된 Workflow/Profile v1에 동적 메서드 참조를 자동 저장하지 않는다. 현재 요청의 계획에만 포함한다. managed policy가 새 capability를 인가하지 못하면 명시적 거부/미지원이며 Community로 downgrade하지 않는다                                                                                                                                                                                                         | C3/C6, R06/R08/R14/R20     |
| X12 | [Community/Enterprise backlog](community-release-enterprise-followup.md)와 [교차 저장소 계약 과제](../platform-alignment.md#8-contract-gaps)                                                                                                      | 기존 미완료 출시·Platform 계약과 별도 Browser-local 기능이다. 새 권한·승인 category·wire 변경의 외부 영향은 C1/C5에서 기록하며 Browser fixture를 Enterprise 활성화/릴리스 증거로 사용하지 않는다                                                                                                                                                                                                                           | C1/C5/C8, R20              |

X01/X03/X04의 기존 음성 테스트는 기존 adapter/Discovery 경로의 회귀로 보존한다.
새 동적 경로에는 승인된 호출의 양성 검증과 미확인·미승인·stale 참조의 음성 검증을
추가한다. 제품 경로를 실제 전환해 기존 assertion이 달라지면 해당 테스트의 전제·경로와
변경 이유를 함께 갱신하며, 실행 0건이라는 검증을 단순 삭제하지 않는다.

## 처리 흐름과 초기 지원 범위

1. Provider가 기존 목록·검색·부분 읽기로 필요한 script 근거를 확보한다.
   source 동의·host/fetch 제한·마스킹·누적 coverage와 continuation은 유지한다.
2. Provider가 후보 객체/메서드를 제시하거나 목록에서 찾는다. 확장은 제한된 런타임
   관찰로 호출 가능 여부를 확인하고 opaque `method_ref`와 근거 ID를 발급한다.
3. Provider가 참조·정확한 JSON 인자·목적·예상 효과·근거를 포함한 호출을 제안한다.
   인자 부족·호출 수단 미지원·불명확한 대상은 결과/추가 질문으로 반환한다.
4. Worker가 capability·정책·승인과 request/document/method/argument binding을 확인한다.
   실행 직전 원래 요청·페이지·정책 revision을 재검사하고 메서드를 호출한다.
5. 호출 receipt와 제한된 반환 데이터를 수집한다. 반환 데이터는 별도 전송 정책과
   마스킹/직렬화 검사를 거친다. 반환값 확보 실패를 재호출 이유로 사용하지 않는다.
6. 거부·미지원·예외·timeout도 원래 `tool_call_id`에 한 번 반환한다. 같은 conversation의
   다음 Provider turn은 반환 데이터와 최신 관찰로 추가 읽기·목표 판단·필요한 다음 제안을 한다.

초기 범위는 현재 top document에서 접근 가능한 페이지 공개 객체의 메서드와 JSON 인자다.
사이트별 객체명/함수명을 제품 코드에 고정하지 않는다. prototype 메서드·중첩 경로의
지원 깊이/개수, getter/Proxy·native/bound 함수 제외 기준은 C1/C2에서 검증해 확정한다.
소스의 이름·함수 `length`만으로 완전한 타입·기본값·부작용을 보증하지 않는다.
모듈/클로저 비공개 함수, callback/DOM 객체 인자, 반환 객체 handle 연쇄 호출,
새 외부 script 로딩·임의 endpoint 호출, iframe/shadow 지원은 초기 범위에서 제외한다.

Provider가 작성한 JavaScript를 실행 입력으로 받지 않는다. 번들된 탐색·호출기가 현재
페이지의 메서드를 호출하고 원래 receiver의 `this`를 유지한다. source 읽기 성공을
서버 저장·credential 접근·R1/read-only 인가의 증거로 사용하지 않는다.

## 구현 카드와 선행 결정

| 카드   | 작업·주요 연결 위치                                                                         | 종료 조건·선행 조건                                                                                                                                                                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S23-C1 | 실행 모델/참조 수명/영향 미확인 정책/외부 계약 영향 결정, 계약·schema·result 상태 정의      | runtime 함수/receiver handle 유지 또는 호출 직전 경로 해석의 의미를 명시. 동일 소스=동일 객체로 간주하지 않음. 최소 Chrome 실증으로 유효성을 확인한 뒤 C2~C7 착수. 미결정은 이름만 가진 도구를 callable로 노출하지 않음                                                 |
| S23-C2 | consent-gated MAIN-world inventory, 기존 source reader의 근거 ID 결속, 동적 proposal schema | 별도 list/describe tool 대신 동의 후 요청별 inventory enum을 제공하고 검색·읽기된 source evidence로 proposal을 묶는다. candidate inventory는 runtime locator이며 호출 보증이 아니다. Chrome Act inventory wiring은 통제 fixture와 실제 OpenRouter/OpenAI에서 PASS |
| S23-C3 | `propose_page_method_call`·새 capability·plan/inventory/proposal/parser·enterprise 인가     | JSON 인자 전체와 method/plan/request revision 결속. source 사실·Provider 추정·권한 판정 구분. 미확인 영향을 무조건 R1로 취급하지 않음                                                                                                                                   |
| S23-C4 | 원래 요청에 결속된 호출기·dispatch receipt·timeout/exception·중복 방지                      | 원래 `this`, 호출 ID/논리 단계 단일 소비. await/dispatch 직전 검사. 함수 예외 뒤 부분 효과·timeout·restart는 no-retry. 같은 인자가 필요한 별도 승인 단계와 재전송을 구분                                                                                                |
| S23-C5 | 반환 데이터 전송 category·설정/strict schema 이전·동의·bounded serializer·마스킹            | 실행/전송 허용을 분리. 코드 전송 grant를 반환 데이터에 재사용하지 않음. 기존 full/ask/custom/deny 이전·revision/Provider 결속. getter/toJSON/custom iterator와 무제한 객체 직렬화 방지                                                                                  |
| S23-C6 | Options·호출 승인 UI·API 힌트 진입점·timeline·plan/value/Workflow/history 호환              | 메서드·인자·목적·효과 미확인을 검토 가능한 형태로 표시. Full Permission auto·custom/deny 일치. dynamic ref/승인 능력의 저장·재생 금지, 구버전 기록 표시 회귀                                                                                                            |
| S23-C7 | 반환값/오류 tool 결과·추가 관찰·action/goal assessment·budget                               | 동일 call ID 결과는 정확히 한 번. 반환과 효과 확인 분리, 새 관찰 없는 VERIFIED 금지. 반환 데이터가 없는 정상 호출·비UI 조회 결과도 목적별 판단. typed 실패/dispatch history 보존                                                                                        |
| S23-C8 | 단위/fixture/실제 Chrome/지정 live Provider/holdout·진단·충돌 회귀 증거                     | R01~R20 검증. X01~X12 처리 결과와 실제 지원 행렬, 실패·미검증·rollback 및 artifact revision 기록                                                                                                                                                                        |

C1은 다음 세 결정을 먼저 완료한다. **메서드 참조/receiver 수명의 구현 가능성**, **영향을
확정하지 못한 메서드에 적용할 인가 정책**, **반환 데이터 전송의 scope와 승인 계약**이다.
함수의 이름·소스 fingerprint만으로 객체 동일성을 보증하지 않는다. 참조 유효성을
보장할 수 없는 후보는 호출하지 않는다. CDP Runtime 등 별도 실행 권한이 필요하다는
결론이면 S2와의 충돌·권한 UX·검증 범위를 본 Sprint에 추가 결정한 뒤 구현한다.

## 호출 및 결과 계약에서 확정할 내용

입력은 `method_ref`, JSON `arguments`, request/plan revision, 목적·예상 효과·근거 ID다.
실행용 경로/함수 handle과 원시 인자는 Worker/실행 경계 안에서 관리한다. Provider의
관찰된 이름·설명은 사용할 수 있지만 호출 권한은 유효한 opaque ref와 승인 binding으로만 확인한다.

| 결과 축      | 필요한 구분                                                                          |
| ------------ | ------------------------------------------------------------------------------------ |
| dispatch     | `not_dispatched / dispatched / unknown`; 실제 receipt 근거로 기록                    |
| invocation   | `not_started / returned / threw / timed_out`; 반환 자체는 VERIFIED 아님              |
| return_data  | 전송 허용/거부, undefined/null 구분, masked/truncated/unsupported 여부·크기·coverage |
| observation  | 현재 request/document에 결속된 관찰 ID·근거·시각과 누락 사유                         |
| verification | 호출 효과·현재 기대 상태·전체 목표를 각각 확인/실패/미확인; 원시 receipt 보존        |

상태 enum과 외부 terminal wire의 매핑은 C1/C7에서 정의한다. 데이터 반환이 유일한
목적인 호출에 UI 변화만 요구하지 않고, 서버 저장 같은 업무 목적에 반환값만으로
authoritative 완료를 주장하지 않는다. 메서드·소스·반환 데이터의 지시문은 untrusted
evidence이며 사용자 요청·운영 정책을 변경할 수 없다. 마스킹 실패는 전송 0건으로 처리한다.

## 검증 행렬

| ID      | 시나리오                                                               | 기대 결과                                                                                                     |
| ------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| S23-R01 | 처음 보는 사이트 script에서 필요한 메서드를 Provider가 발견            | site adapter/고정 함수명 없이 목록→검색→읽기→ref→제안→승인→실제 호출→반환→다음 판단 연결                      |
| S23-R02 | 큰 bundle·여러 chunk·빈 부분 검색·읽기 거부·소스 변경                  | S16 coverage/continuation·동의 유지. 불완전한 분석을 전체 검토로 표시하지 않음                                |
| S23-R03 | nested/prototype 메서드·접근 불가능한 private/module 함수·getter/Proxy | 지원 범위·관찰 제한 명시, getter를 자동 호출하지 않음. reflective trap 가능성을 비실행 보장으로 위장하지 않음 |
| S23-R04 | 동일 소스의 다른 closure·함수/receiver 교체·stale/위조 ref·지연 probe  | 명시한 참조 수명 모델에 따라 차단·재탐색. source fingerprint만으로 같은 함수 승인 유지 없음, 원래 `this` 검증 |
| S23-R05 | 조회처럼 보이는 mutation·영향 미확인·Ask 호출 요청                     | read-only/R1로 자동 승격하지 않음. C1 정책 결과와 근거 기록. Ask mutation 0건                                 |
| S23-R06 | 승인 확인/full/custom/deny·R2/R3·회사 정책·Chrome 권한 부족            | 유효 category별 실제 실행/전송 일치. Full 자동 승인과 hard deny/권한 경계 유지                                |
| S23-R07 | JSON 인자 중첩·누락·잘못된 타입·민감값·clarification                   | 정확한 승인 인자만 적용. 원문 trace/history/ZIP 유출 없음, 추정 기본값 실행 없음                              |
| S23-R08 | plan/method/arguments/request revision 변경·사용자 정정                | 과거 승인·ref·값 재사용 0건, 새 제안·revision과 정확한 인자 digest 확인                                       |
| S23-R09 | source 허용/runtime 반환 전송 거부·다른 Provider·큰 반환 데이터        | 실행/전송 결과 분리. 코드 grant 재사용 없음, 전송 거부 0건. 마스킹·잘림·불완전 coverage 표시                  |
| S23-R10 | probe/승인/marker 대기 중 Stop 후 같은 탭 새 요청                      | 이전 호출 0건, 새 요청 progress/marker/terminal 오염 0건; S10-R R01~R05 회귀                                  |
| S23-R11 | 호출 뒤 timeout/Stop·예외 전 일부 효과·navigation                      | receipt/부분 효과 미확인 보존, 자동 재호출 0건. 최신 관찰만 재검사                                            |
| S23-R12 | 중복 call/승인 응답·worker restart·동일 인자 별도 논리 단계            | 같은 호출의 중복 dispatch 0건, 재시작 자동 재개 0건. 새 승인 단계의 의도된 반복과 구분                        |
| S23-R13 | settings/Provider 변경·전송 대기·approval v1 migration·history 복구    | 구 grant 폐기·원래 요청 취소, 신규 strict schema 안전 이전, 오래된 능력 replay 0건                            |
| S23-R14 | signed Profile 검증 실패·PDP deny/outage·미지원 capability             | 기존 hard failure 우회/Community downgrade/동적 호출 fallback 0건                                             |
| S23-R15 | 반환 undefined/null/순환 객체/함수/DOM 객체/getter/toJSON              | 호출 결과와 반환 표현 실패를 분리. 제한된 직렬화·데이터 노출 검사, 수집 실패로 재호출 없음                    |
| S23-R16 | 정상 반환 뒤 UI 변화 없음·비UI 데이터 조회·서버 저장 주장              | invocation/action/goal 각각 판단. UI 없는 조회를 무조건 실패 처리하지 않고 서버 commit은 별도 근거 요구       |
| S23-R17 | 반환 데이터의 부분 목록·비밀값·prompt injection                        | EOF/total 추측 없음. 자료를 지시로 실행하지 않음, provider egress/trace/ZIP의 민감 원문 부재                  |
| S23-R18 | 객체명·함수명·DOM 변경 holdout와 실제 Provider                         | 모델이 소스 근거로 선택, fixture 의미 hardcoding 없음. offered schema/call/result/next turn/최종 UI 증거      |
| S23-R19 | API 힌트 UI·자동 승인 이력·원시 반환/인자 보관·구버전 정책             | 실제 호출 지원/미지원과 UI 일치. 자동 승인 source 구분, 능력·민감 원문 persistence 0건                        |
| S23-R20 | 기존 adapter·script read·plan·component·Workflow·Ask·진단 회귀         | X01~X12의 보존 경계 확인, 기존 증거와 신규 evidence 범위 분리                                                 |

## 실행 증거와 종료 조건

Pinned `pnpm@9.15.4`로 typecheck/lint, 영향받는 unit/fixture/E2E, module-boundaries,
method-trace와 관련 Chrome 회귀를 실행한다. 버전 유지 빌드는
`pnpm exec tsc -p tsconfig.build.json && node scripts/build-extension.mjs && node scripts/validate-package.mjs`다.
Live 설정·비밀값 취급·명령은 [테스트 가이드](../test.md)를 따른다.

통제 Chrome은 새 동적 경로 외에 S10/Discovery·S10-R, S15~S19·S21/S22의 영향받는
행렬을 선택한 근거와 함께 실행한다. 새 live 표본은 객체/함수명이 다른 독립 페이지,
데이터 반환과 UI 변경, 실제 source 동의/Full Permission 및 holdout을 포함한다.
Provider schema·동일 call ID·실제 dispatch 횟수·반환 데이터의 마스킹·후속 판단·최종 UI를
관찰한다. 단위 통과·HTTP 성공·기존 S20 PASS는 live 의미 검증을 대신하지 않는다.

- C1의 미결정과 X01~X12의 처리 결과가 코드/계약/설정·테스트로 연결돼 있어야 한다.
- R01~R20의 검증 범위·횟수·실패·재실행·미지원·budget을 실제 evidence로 기록한다.
- raw 함수/반환 데이터·credential·승인 능력의 diagnostics/storage/export 유출이 없어야 한다.
- 신규 경로를 비활성화했을 때 기존 읽기·등록 API·DOM·승인 정책을 유지하는 rollback을 검증한다.
- Sprint 목록/진행 기록/소스 안내를 구현 revision의 근거로 갱신한다. 미검증 항목이 남으면
  Planned/In Progress 또는 범위를 명시한 Partial로 유지하며 기존 Sprint 완료 상태를 대신 사용하지 않는다.

운영 사이트·임의 Provider/모델·Platform 통합·설치·배포는 별도 증거 없이 완료로 확대하지 않는다.
최종 실행 결과는 [S23 리뷰 후 증거](../evidence/s23-page-method-review-2026-10-12.md)에 기록한다. [이전 구현·실패 기록](../evidence/s23-provider-page-method-2026-10-11.md)은 당시 revision의 이력으로 보존한다.

## 후속 UI 정리 — 2026-10-12

X01/C6/R19의 기존 수동 API 힌트 진입점을 제거한다. 버튼·후보 검토 dialog·전용
Side Panel controller와 START/STOP 메시지 handler를 삭제하고, 기존 Chrome 검사를
UI 부재·폐기된 메시지 거부 회귀로 전환한다. 분석 API 가용성 확인에 사용하는
공용 Discovery scanner와 S23 Act 동적 메서드 탐색·승인·호출은 유지한다.
과거 S10/S23 증거는 당시 revision의 기록으로 보존한다.

검증: pnpm 9.15.4의 typecheck·lint·module-boundaries, 관련 unit 12파일/68개,
버전 유지 빌드·package validation을 통과했다. Chrome for Testing의
`pnpm test:chrome-page-api-discovery`는 실제 Side Panel에서 버튼/dialog 부재와
START/STOP의 `INVALID_ARGUMENT` 거부를 확인했다. 확장 버전은 0.1.108로 유지했다.
이 후속 검증에서는 실제 Provider 호출·운영 사이트·배포를 재검증하지 않았다.
