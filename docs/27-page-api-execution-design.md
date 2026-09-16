# 27. 페이지 내부 함수·공개 API 실행 설계

- 작성일: 2026-09-16
- 상태: Implemented (자동 검증 완료) / 실제 Chrome fixture 증거 대기
- 구현 인계 대상: GPT-5.6 Terra
- 범위: Browser 로컬 구현. 이번 변경은 설계 문서만 추가한다.
- 관련: [완료 조건](25-act-completion-conditions.md), [결과 관측](26-act-result-observation-design.md), [Profile 계약](22-page-profile-provider-design.md), [bounded CDP](15-bounded-cdp-adapter.md)

## 1. 목표와 현재 상태

승인된 페이지 동작을 사이트가 노출한 공개 JavaScript API로 실행한다. 예를 들어 테스트 사이트의 `window.demoControls.selectVariant(id)`를 호출하고 선택 결과를 화면에서 확인한다. 이 함수명은 fixture용 예시이며 실제 Variant 사이트에 존재한다고 가정하지 않는다.

현재 content script는 DOM 이벤트를 발생시키며 bounded CDP는 제한된 입력 명령을 사용한다. `workflow-source-analysis.ts`의 소스 분석은 UI Workflow 추론이며 페이지 함수 호출 기능이 아니다. 작업 중인 manifest에는 scripting 권한이 있지만, 이것만으로 공개 API 실행 계약이 생기는 것은 아니다.

v1은 **확장 번들에 포함된 어댑터 + 정확한 origin 매칭 + 공개 API + 동일 문서의 UI 결과 검증**을 지원한다. 모듈/클로저 내부 함수, React Fiber 등 비공개 상태 탐색, 모델 생성 코드, 원격 코드 다운로드, 임의 함수 경로 해석, eval/new Function, 페이지 fetch/WebSocket 직접 대체는 지원하지 않는다.

공개 API가 없는 사이트는 기존 DOM/CDP 경로를 사용한다. 미확인 실행 후 DOM/CDP로 자동 대체하지 않는다.

## 2. 실행 경계

```text
번들 어댑터 후보 발견 → 모델의 업무 동작 제안 → 사용자 승인
→ 고정 탭/문서/scope 및 정책 재검사 → dispatch marker 저장
→ scripting.executeScript(MAIN, 고정 함수, 검증된 인자) 1회
→ ISOLATED content snapshot 관측 → 완료 조건 평가 → terminal
```

Service Worker가 권한, 정책, 승인, 인자, 실행 generation 및 terminal을 소유한다. MAIN world는 페이지가 수정할 수 있는 환경이며 신뢰하지 않는다. 페이지가 반환한 `ok`, nonce, generation, 서명처럼 보이는 값은 승인이나 성공의 근거가 아니다. 어댑터 probe 역시 페이지의 주장일 뿐이다.

`Runtime.evaluate`를 제품 실행 경로에 추가하지 않는다. 기존 CDP allowlist는 유지한다. 새 execution path `page_api`는 별도의 scripting runner이며 기존 문서의 `dom|bounded_cdp` 열거형을 구현 시 명시적으로 확장한다.

MAIN world로 API key, 브라우저 credential, action/confirmation token, provider 설정 또는 사용자 비밀 입력을 전달하지 않는다. v1 인자는 번들에 정의된 비민감 enum으로 제한한다. 페이지 자체 API가 기존 로그인 세션을 사용하는 것과 확장이 credential을 전달하는 것은 구분한다.

## 3. 번들 어댑터 계약

신규 `extension/src/page-api/`에 registry, 타입, 사이트 어댑터를 둔다. 어댑터는 확장 코드 리뷰 및 빌드를 통해 배포한다. 사이트/모델/Profile이 실행 코드를 제공하지 않는다.

| 필드                 | v1 계약                                                                               |
| -------------------- | ------------------------------------------------------------------------------------- |
| adapter_id / version | 번들 고정 ID와 정수 버전, ID 1–64 ASCII 문자                                          |
| origins              | 명시적인 HTTPS origin 목록, 와일드카드 없음. HTTP localhost는 fixture 빌드에서만 허용 |
| path match           | 번들 함수가 정한 경계 있는 경로 검사, 모델 입력 아님                                  |
| action_id            | 번들에 정의된 ID, 최대 16개 동작                                                      |
| label / description  | 승인 UI 및 모델용 검토된 설명                                                         |
| effect / risk        | v1은 local-ui-only / R1만 허용                                                        |
| arguments            | 정확히 하나의 `option_id` enum, 1–128개, 각 1–64자. unknown key 거절                  |
| completion           | 같은 page scope에서 선택 컨트롤과 예상 선택 상태를 확인하는 번들 predicate            |
| probe / invoke       | MAIN world에서 실행 가능한 자체 완결 함수. 외부 closure/import에 의존하지 않음        |

registry가 exact origin과 경로를 확인한 다음에만 probe한다. 지원 여부는 공개 함수 존재, 명시적 API version 및 컨트롤 계약으로 검사한다. probe는 부작용 없는 사이트 계약이 있을 때만 등록한다. 지원 API를 자동 탐색하거나 전역 객체를 열거하지 않는다.

invoke는 고정 property 접근으로 receiver를 보존해 호출한다. 예: `const api = window.demoControls; api.selectVariant(args.option_id)`. dot-path 문자열을 순회하지 않는다. 페이지 getter나 함수가 임의 코드일 수 있다는 점은 MAIN trust boundary로 취급한다.

## 4. 모델·승인·정책 계약

신규 logical tool은 `call_page_api`, 모델 제안 함수는 `propose_page_api`로 한다. 기존 `call_page_business_tool` 및 Business MCP와 혼합하지 않는다.

모델 인자: `{ action_ref, option_id, approval_scope: "single_step", approval_reason }`. `action_ref`는 run별 opaque enum이며 Worker에서만 어댑터/action/version으로 해석한다. 함수명, JS 코드, selector, raw URL, adapter internals는 모델 schema에 넣지 않는다. 같은 요청 내 후속 호출도 v1에서는 별도 승인을 받는다.

승인 카드에는 업무 동작명, 선택 옵션의 검토된 표시 이름, 페이지 내 상태 변경 범위와 완료 확인 방법을 표시한다. 모델이 말한 기능 설명을 권한 근거로 사용하지 않는다.

새 discriminated intent를 만든다. DOM target ref가 필수인 기존 `ActionIntent`에 가짜 ref를 채워 넣지 않는다. 기존 intent는 DOM variant로 보존하고 page-api variant를 별도로 validate한다.

Worker 소유 intent에는 request/run/action ID, generation, tabId/frameId=0, Chrome documentId, content document_epoch, page_scope_epoch, origin, adapter ID/version, action ID, canonical argument digest, completion digest 및 approval binding을 포함한다. 원문 인자는 승인 실행 동안 메모리에만 유지한다. approval digest에 인자와 어댑터 버전·완료 조건을 모두 결합한다.

정책 capability에 `page_api`를 명시적으로 추가한다. 이를 `click`으로 위장하지 않는다. 로컬 PermissionManager와 enterprise policy validator가 모두 이해해야 하며 enterprise가 새 capability를 지원하지 않으면 실행을 거절한다. server-side effect/R2/R3는 v1 registry 등록 및 실행 양쪽에서 거절한다. 자동 발견과 승인은 별개다.

Profile은 v1에서 실행 권한이나 코드를 공급하지 않는다. Browser 번들 registry와 로컬 정책으로 후보를 만들되 기업 정책의 요구를 우회하지 않는다. 향후 Profile이 어댑터 ID/version을 선언하는 기능은 버전 있는 후속 계약이며 Platform 배포 서비스 구현을 전제로 완료 처리하지 않는다.

## 5. 호출 프로토콜과 경쟁 처리

1. 승인 직후 bound panel의 고정 tabId와 활성 top-level Chrome documentId를 얻는다. 현재 등록된 content epoch 및 page scope와 일치해야 한다.
2. exact origin/path, 현재 권한, registry version, approval/argument digest, completion 준비 상태를 재검사한다. 없는 API 또는 검증 불가능한 결과는 dispatch 전에 거절한다.
3. `beforeDispatch`로 기존 durable marker를 저장한다. 저장 실패는 FAILED이며 호출하지 않는다.
4. `chrome.scripting.executeScript`에 `target: { tabId, documentIds: [documentId] }`, `world: "MAIN"`, 고정 `func`, 최소 `args`를 전달한다. frameIds/allFrames를 함께 지정하지 않는다. 호출 함수도 고정 origin/path를 재확인한다.
5. 같은 Worker에서 action ID별 in-flight/consumed 상태로 중복 진입을 거절한다. worker 재시작 후 dispatch marker만 있으면 UNKNOWN으로 복구하고 재호출하지 않는다.
6. InjectionResult가 정확히 하나이며 documentId/frameId가 예상과 같아야 한다. 결과는 closed enum만 읽는다. 임의 반환 객체를 직렬화하거나 모델/로그로 전달하지 않는다.
7. 호출 뒤 독립된 content snapshot으로 완료 조건을 검증한다. run/generation/문서가 바뀐 늦은 응답은 버린다.

documentIds 지정은 full navigation 경쟁을 제한한다. 같은 문서의 SPA 전환은 page scope 검사와 MAIN 내부 경로 재검사로 좁히지만 완전한 원자성은 보장하지 못한다. 따라서 v1은 복구 가능한 로컬 UI 변경으로 제한한다. 동작 후 scope가 변하면 UNKNOWN이며 다음 요청에서 다시 읽는다.

## 6. timeout·취소·오류

예산은 dispatch부터 총 15초로 고정한다. API 응답 대기는 최대 5초이며 남은 시간만 결과 관측에 사용한다. snapshot 각 호출에도 남은 예산을 전달한다. 기존 10초 snapshot timeout을 매번 추가해 전체 시간이 연장되지 않도록 한다.

executeScript를 외부 timeout으로 감싸도 페이지 함수 자체를 중단하거나 롤백할 수 없다. Promise가 끝나지 않거나 동기 코드가 renderer를 막을 수 있다. Worker deadline은 사용자 요청을 종료할 뿐 페이지 코드 종료를 보장하지 않는다. timeout·취소 후 같은 실행을 재시도하거나 대체 실행하지 않는다.

| 조건                             | 결과 / 신규 코드                                                      |
| -------------------------------- | --------------------------------------------------------------------- |
| dispatch 전 지원 어댑터/API 없음 | FAILED / PAGE_API_UNAVAILABLE                                         |
| 어댑터나 인자·결과 schema 부적합 | dispatch 전 FAILED, dispatch 이후 UNKNOWN / PAGE_API_CONTRACT_INVALID |
| dispatch 이후 응답 대기 만료     | UNKNOWN / PAGE_API_TIMEOUT                                            |
| 함수가 throw/reject              | UNKNOWN / PAGE_API_CALL_FAILED                                        |
| 결과 predicate 미충족            | UNKNOWN / POSTCONDITION_UNVERIFIED                                    |
| 문서/scope 교체                  | dispatch 전 FAILED, 이후 UNKNOWN / PAGE_SCOPE_STALE                   |

Chrome injection 오류도 호출 전임을 확실히 증명할 수 없으면 UNKNOWN으로 처리한다. 오류 문구·stack·페이지 반환값은 기록하지 않는다. 성공적으로 전달된 호출과 작업 완료를 구분한다. 모든 terminal은 한 번만 확정하고 code를 run → request → trace → 패널까지 보존한다.

## 7. 결과 검증

v1 fixture는 접근 가능한 선택 컨트롤에서 `option_id`에 대응하는 예상 선택 표시를 확인한다. 비교 규칙과 표시 매핑은 번들 어댑터에 있으며 모델이 임의의 성공 marker를 작성하지 않는다. scope, 컨트롤 유일성, 선택값의 정확한 일치와 준비 기준 상태를 검사한다. generic DOM 변경, 메뉴 닫힘, API의 true 반환만으로 성공시키지 않는다.

이미 요청한 값이 선택돼 있으면 API를 호출하지 않고 `ALREADY_SATISFIED`로 결과를 보고한다. 화면 증거 역시 페이지가 제어하므로 VERIFIED의 의미는 **해당 로컬 UI 상태를 관찰했다**까지다. 서버 저장·업무 처리 완료를 의미하지 않는다. 비동기 server result generation은 후속 설계다.

진단 단계는 PAGE_API_PREPARING, PAGE_API_DISPATCH, PAGE_API_RETURNED와 기존 VERIFYING_RESULT/terminal을 사용한다. diagnostics closed validator와 UI를 함께 갱신한다. request/run 상관관계와 시간·오류 enum만 저장하고 인자, 함수 경로, URL, DOM, 반환 객체는 저장하지 않는다.

## 8. 구현 파일 지도

아래 신규 이름은 제안이다. 기존 composition boundary를 유지하고 대형 entry.ts에 전체 runner를 넣지 않는다.

| 영역          | 변경 대상                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 계약          | 신규 contracts/page-api-types.ts, page-api-validation.ts; core-types/error-codes; action intent union 및 검증 소비자     |
| 어댑터        | 신규 page-api/registry.ts, adapter-types.ts, adapters/fixture.ts                                                         |
| Chrome runner | 신규 service-worker/page-api-runner.ts; browser-api.ts의 scripting/documentIds/InjectionResult 타입                      |
| 제안          | act-tools, act-proposal-parser, act-step-runner, act-session-types; DOM/page-api 제안 분기                               |
| 승인/실행     | act-proposal-readiness/executor, mutation-intent/types/coordinator, runtime-execution; 기존 value/confirmation 보호 유지 |
| 정책          | PermissionManager, enterprise policy request/validator 및 exhaustive switch 전부 검색                                    |
| 관측          | 신규 page-api-observer.ts, page-context-runtime의 남은 deadline 지원; 읽기 결과 검증                                     |
| 복구/진단     | request-execution/lifecycle/store, diagnostics-validation, chat event validators 및 패널 오류·승인 표시                  |
| 문서          | 13/15/25/26번 AS-IS와 새 page_api 경로, 본 설계 구현 상태                                                                |

## 9. GPT-5.6 Terra 구현 순서

1. **계약·registry**: 작업 상태/AGENTS 확인, 기존 변경 보존, intent discriminator와 번들 fixture adapter, closed validators 추가. 이 단계에서 실제 사이트 호출을 활성화하지 않는다.
2. **승인·정책**: opaque action_ref 도구, enum 인자, single_step 카드, digest binding, page_api capability 추가. unsupported enterprise contract 거절 테스트까지 완료한다.
3. **실행·관측**: documentId 고정 MAIN runner, marker 저장, 중복 억제, 고정 deadline, 독립 UI 검증 및 terminal code 보존을 연결한다.
4. **실제 Chrome fixture**: 공개 API를 갖는 제어 가능한 테스트 페이지에서 Side Panel 승인부터 UI 상태/trace까지 검증한다. credential/provider가 필요 없는 결정적 fixture 입력을 사용하고 실제 provider 경로와 구분한다.
5. **사이트 연동**: 대상 사이트의 공개 API 및 부작용/선택값 계약을 확인한 뒤 전용 adapter를 추가한다. 공개 API가 없으면 미지원으로 기록하며 내부 프레임워크를 추측해 호출하지 않는다.

각 단계마다 타입 검사, 해당 회귀 테스트, lint, package/module boundary를 확인한다. 최종 build로 dist-extension을 갱신하고 Chrome에 로드된 버전, fixture 결과 및 테스트 개수를 본 문서에 기록한다. commit/push는 별도 요청 시 수행한다.

### 9.1 구현 증거 (2026-09-16)

- `page-api/` registry와 번들 fixture adapter, opaque `action_ref` / enum `option_id`, 별도 `PageApiIntent`, `page_api` capability 및 closed error/diagnostic validator를 추가했다.
- 승인 후에는 Chrome `scripting.executeScript`의 `MAIN` world와 `target.documentIds`만 사용한다. 고정 adapter dispatch function은 fixture API의 고정 property만 접근하며, 반환값은 closed enum으로만 소비한다.
- dispatch 전 marker 저장, 동일 run/action의 in-flight·consumed 억제, 15초 총 예산/5초 MAIN 응답 예산, ISOLATED semantic snapshot 기반의 independent completion observer를 연결했다.
- `pnpm typecheck`, 68개 unit test file/231 tests, `pnpm test:fixture`, `pnpm test:e2e`, package validation과 build (`0.1.61`)를 통과했다. 전체 `pnpm lint`의 Prettier 단계는 이번 변경과 무관한 기존 3개 파일 형식 문제로 실패했으며 ESLint 자체는 통과했다. `check:module-boundaries`는 통과했고 `check:source-size`는 기존 전역 초과 목록 때문에 실패하지 않도록 새 page-api source는 모두 200줄 이하로 유지했다.
- 실제 Chrome에서 로드한 fixture의 승인→UI 증거는 아직 수행하지 않았다. 따라서 API-01~14 전체 완료 및 Chrome-ready 주장에는 이 증거가 추가로 필요하다.

Terra 시작 프롬프트:

> docs/27-page-api-execution-design.md를 기준으로 page API v1을 구현한다. 기존 미커밋 수정과 scripts/run-chrome-debug.sh를 보존한다. 먼저 계약과 fixture 어댑터를 만들고 승인·정책·MAIN runner·독립 결과 검증을 연결한다. 실제 사이트 공개 API를 가정하지 않는다. 임의 JavaScript 실행 도구와 remote code를 추가하지 않는다. Chrome fixture에서 승인부터 결과까지 검증하고 설계의 상태와 증거를 갱신한다. 기존 DOM/CDP 실행과 승인 보호에 회귀가 없어야 한다.

## 10. 수용 테스트

| ID     | 시나리오                                          | 기대                                               |
| ------ | ------------------------------------------------- | -------------------------------------------------- |
| API-01 | fixture의 올바른 enum 선택                        | 승인 1회, API 호출 1회, 정확한 UI 선택 뒤 VERIFIED |
| API-02 | 이미 선택된 값                                    | 호출 0회, ALREADY_SATISFIED                        |
| API-03 | 없는 API/버전 불일치                              | dispatch 전 거절                                   |
| API-04 | unknown key/함수 경로/JS 문자열/enum 외 인자      | schema 단계 거절                                   |
| API-05 | 승인 뒤 인자·어댑터 버전 변경                     | digest 불일치 거절                                 |
| API-06 | 승인 대기 또는 dispatch 직전 full/SPA navigation  | 이전 문서 호출 금지 또는 경쟁 후 UNKNOWN           |
| API-07 | 다른 origin/frame/탭과 위조 action_ref            | 거절                                               |
| API-08 | true 반환, UI 불변 또는 잘못된 값                 | UNKNOWN                                            |
| API-09 | Promise 지연/throw/renderer 응답 없음             | 고정 deadline, UNKNOWN, 재호출 0회                 |
| API-10 | dispatch 후 worker 재시작/취소/중복 승인          | terminal 중복 없음, 재호출 0회                     |
| API-11 | 늦은 응답/페이지 위조 메시지                      | 권한·terminal 변경 없음                            |
| API-12 | enterprise capability 미지원, R2/server-side 등록 | 실행 전 거절                                       |
| API-13 | 진단/모델/스토리지 검사                           | 코드·URL·인자·credential·raw result 유출 없음      |
| API-14 | 기존 navigate/native select/Variant 메뉴          | 기존 경로 회귀 없음                                |

완료 조건은 API-01~14 자동 검증과 실제 Chrome fixture 증거다. 공개 API를 확인하지 않은 실제 사이트 지원, Platform 배포 연동, server-side 호출은 v1 완료 범위 밖이다.

## 11. 근거

- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting): MAIN execution world, documentIds 대상 지정, Promise 반환 처리.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): isolated world와 MAIN 환경 차이.
- 이 문서는 실행 환경의 지원과 제품 승인/검증 계약을 분리한다. Chrome의 MAIN 지원 자체가 사이트 함수의 안전성·존재·성공을 보장하지 않는다.
