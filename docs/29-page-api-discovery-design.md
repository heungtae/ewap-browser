# 29. Page API Discovery 설계

- 작성일: 2026-09-19
- 상태: Partial implementation — fixed scanner, document-bound controller, ephemeral candidate result와 별도 Browser 검토 dialog가 구현됐다. Ask/Act 분석 데이터 source discovery 연결과 reviewed read-only adapter를 통한 data read는 [32번 통합 설계](32-ask-act-analysis-data-acquisition-design.md) 기준 Proposed다. 실제 검토자 인증/외부 작업 항목 생성 및 전체 unpacked Chrome fixture 검증은 별도다.
- 구현 인계 대상: Browser extension
- 범위: Browser 로컬 구현. `page-api/` 번들 레지스트리에 추가할 후보를 사람이 검토하기 위한 **발견 증거**만 정의한다.
- 관련: [페이지 내부 함수·공개 API 실행 설계](27-page-api-execution-design.md), [Page Profile 배포·신뢰·MCP 설계](22-page-profile-provider-design.md), [객체 특성별 Collection Reading 설계](28-collection-reading-strategy-design.md), [Ask/Act 분석 데이터 수집 통합 설계](32-ask-act-analysis-data-acquisition-design.md)

## 1. 결정

Discovery는 실행 capability가 아니다. 현재 페이지에서 관찰한 제한된 후보를 Profile Builder의 권한 있는 검토자에게만 보여 주고, 이후 개발자가 코드를 검토하여 확장 번들 adapter를 추가할 때 참고하는 자료다.

```text
명시적 Profile Builder scan
        |
        v
document-bound, redacted candidate evidence
        |
        v
검토자가 "adapter 검토 필요"로 표시
        |
        v
별도 개발·코드리뷰·빌드로 bundled adapter 작성
        |
        v
doc 27 registry에 exact origin/path/version/action을 등록
```

따라서 후보를 Test, Invoke, HTTP fetch, WebSocket 연결, event dispatch, storage read/write로 전환하지 않는다. `page-api`의 제품 실행은 계속 [doc 27](27-page-api-execution-design.md)의 reviewed bundled adapter만 사용한다.

### 1.1 Ask/Act 분석 source discovery 역할 — Proposed

Ask/Act에서 사용자가 페이지 데이터 분석을 명시적으로 요청하면, Provider가 tool call로 scanner를 지시하는 것이 아니라 Browser request dispatcher가 [32번](32-ask-act-analysis-data-acquisition-design.md)의 4.1에서 fixed scanner를 시작할 수 있다. scanner는 Page API **source availability**만 판단한다.

- candidate와 raw scanner result는 Provider, model, chat history, diagnostics, export에 전달하지 않는다.
- exact origin/path/version에 결속된 reviewed read-only adapter가 candidate 유형과 일치할 때만 Browser는 `page_api_read` analysis source를 `READY`로 만든다.
- adapter가 없으면 Panel은 `REQUIRES_ADAPTER_REVIEW`만 보이며, 현재 Ask/Act run은 candidate를 호출하거나 그 후보를 데이터 분석의 근거로 삼지 않는다.
- collection descriptor는 28번의 별도 `collection` source이며, Page API candidate가 collection reader의 selector/scroll 권한 또는 coverage를 변경하지 않는다.

이 역할은 Page API 실행 action capability와 다르다. `page_api_read`는 R0 관측이고, `page_api` action은 기존의 단일 승인·dispatch·postcondition 계약을 유지한다.

### 1.2 v1 목표

- 명시적 사용자 동작으로 현재 top-level document의 제한된 public JavaScript 함수 후보를 찾는다.
- inline script에서 endpoint-like 호출 패턴을 **정적 힌트**로 분류한다.
- 후보의 신뢰도·제한·폐기 사유를 표시하고, 검토자가 adapter 작업 항목을 만들 수 있게 한다.
- navigation, page-scope 변경, 취소, worker 재시작에서 후보를 fail-closed로 폐기한다.

### 1.3 v1 비목표 및 금지 경로

- 임의 전역 객체의 재귀 열거, framework/private state, closure/module scope, `eval`, `new Function`, `Runtime.evaluate`
- external script 또는 source map 다운로드·보관·분석, network response/HAR/CDP instrumentation
- 발견한 URL, 헤더, body, cookie, token, WebSocket/SSE endpoint로 Extension이 직접 통신하는 것
- 발견한 함수·custom element method의 직접 호출, event dispatch, feature flag 변경, storage 직접 읽기/쓰기
- 후보 또는 raw page data를 모델, provider, diagnostics, export, persistent storage에 전달하는 것

REST/WS/Storage/Event/Source-map discovery와 해당 직접 실행은 v1 범위 밖이다. 별도 제안이 필요하며, 이 문서의 후보를 그 기능의 권한 근거로 사용할 수 없다.

## 2. 신뢰·권한 경계

Service Worker가 scan 권한, panel binding, document identity, page scope, cancellation 및 terminal result를 소유한다. MAIN world는 페이지가 수정 가능한 비신뢰 환경이다. MAIN world가 돌려준 모든 값은 후보 표시용 비신뢰 metadata일 뿐, 권한·성공·안전성의 증거가 아니다.

```text
Bound Side Panel
    -> worker: current tab / top document / policy 재검사
    -> MAIN: fixed scanner, closed arguments, documentId target
    -> worker: closed, bounded, redacted result validator
    -> ephemeral Profile Builder list
```

scan은 다음 조건을 모두 만족할 때만 시작한다.

1. bound Side Panel의 명시적 Page Data 분석 요청 또는 Profile Builder scan click으로 시작한다. Chat/LLM tool, page message, content script는 scanner를 직접 시작할 수 없다. Ask/Act의 경우에도 Provider 응답 뒤에 scanner를 시작하지 않으며 Browser dispatcher가 Provider turn 전에 시작한다.
2. worker가 active top-level `tabId`, `documentId`, origin, content `document_epoch`, `page_scope_epoch`를 함께 고정하고 managed/enterprise origin policy를 재검사한다.
3. `chrome.scripting.executeScript` target은 `tabId`와 그 `documentIds: [documentId]`만 사용한다. frame/allFrames target은 사용하지 않는다.
4. scan 중 navigation, document/page scope 변경, panel unbind, Stop, worker restart가 발생하면 결과를 버리고 `STALE`, `CANCELLED`, 또는 `UNKNOWN`으로 terminal 한다. stale result를 재시도하거나 다른 document에 적용하지 않는다.

`activeTab` 또는 manifest host permission은 Chrome injection 권한일 뿐이다. 지원 origin과 scanner 사용 권한은 Browser policy가 별도로 제한해야 하며, manifest의 넓은 host permission을 discovery 허용 목록으로 해석하지 않는다.

## 3. 후보와 데이터 최소화

후보는 실행 주소록이나 Profile의 `pageApis`가 아니다. `candidate_ref`는 현재 worker memory에서만 해석되는 run-scoped opaque ID다.

```ts
type DiscoveryCandidate = {
  candidate_ref: string;
  kind: "public_js_function_hint" | "script_endpoint_hint";
  label: string; // scrubbed, 64 code points 이하, HTML/URL/query/secret 금지
  confidence: "low" | "medium";
  evidence: readonly (
    | "OWN_DATA_DESCRIPTOR"
    | "FUNCTION_SHAPE"
    | "INLINE_SCRIPT_LITERAL_PATTERN"
  )[];
  limitations: readonly (
    | "UNTRUSTED_MAIN_WORLD"
    | "NO_EXECUTION"
    | "NO_EXTERNAL_SCRIPT"
    | "POSSIBLE_REFLECTION_TRAP"
  )[];
};

type DiscoveryResult = {
  candidates: readonly DiscoveryCandidate[];
  truncated: boolean;
  terminal:
    | "COMPLETED"
    | "CANCELLED"
    | "STALE"
    | "MAIN_UNRESPONSIVE"
    | "POLICY_DENIED";
  duration_ms: number;
};
```

다음 정보는 scanner result, candidate, panel, model, diagnostics, cache 및 Profile에 넣지 않는다.

| 금지 데이터            | 예시                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| 실행 식별자            | JavaScript path, receiver, selector, DOM node, endpoint URL, query, source location                             |
| 인증·입력              | Authorization/header/cookie/token, request body, argument 값, storage key/value                                 |
| raw source·업무 데이터 | script/source-map text, surrounding code, response schema/value, feature flag value, analytics property example |
| 장기 추적 데이터       | page title, fingerprint material, full script src 목록, cache timestamp와 후보의 결합                           |

label은 fixed allowlisted category 또는 scrubbed identifier만 쓴다. 문자열이 URL, credential-like text, HTML, 64자를 넘는 값이면 `redacted candidate`로 대체한다. UI는 `textContent`로만 렌더링한다.

## 4. v1 발견 소스

### 4.1 Public JavaScript function hint

이 scan은 함수 호출이나 실행 가능성 확인이 아니다. scanner는 top-level `window`의 own property 중 **data descriptor**인 후보 root만 제한적으로 보고, 정책이 허용한 root 명칭에 대해서만 한 단계의 own data descriptor를 살핀다. depth는 1이며 generic nested traversal은 허용하지 않는다.

```text
window own data descriptor
  -> policy-approved root name
  -> one-level own data descriptor whose value is callable
  -> opaque candidate_ref + redacted function-shape label
```

다음은 하지 않는다.

- `obj[key]` 접근, getter/setter 호출, `toString`, `constructor`, `prototype` traversal
- Proxy인지 판별하려는 추가 reflection, class/framework instance traversal
- arbitrary root name, selector, path를 model 또는 page message에서 받아 scan하는 것

`Object.getOwnPropertyNames`와 `Object.getOwnPropertyDescriptor`도 hostile Proxy/host object의 trap을 실행하거나 renderer를 막을 수 있다. 그러므로 scanner는 user-triggered best-effort 관측이며, Worker deadline은 UI request를 끝낼 뿐 MAIN 실행을 강제 중지하지 못한다. deadline 이후 결과는 반드시 버리고 재시도하지 않는다. 이 위험 때문에 후보의 confidence는 `high`가 될 수 없다.

### 4.2 Inline-script endpoint hint

inline script의 text만 MAIN scanner 내부에서 크기 제한(스크립트당 64 KiB, 총 256 KiB)으로 읽고, literal `fetch`, `axios`, XHR 호출 패턴을 분류한다. raw text는 result로 직렬화하지 않는다.

허용되는 반환 정보는 `script_endpoint_hint`, HTTP method category (`GET` 또는 `MUTATING_OR_UNKNOWN`), same-origin 여부의 보수적 분류, 그리고 `INLINE_SCRIPT_LITERAL_PATTERN`뿐이다. 경로·URL·query·headers·body·source 위치·주변 코드·GraphQL query는 반환하지 않는다.

external script, module dependency, source map은 fetch하지 않는다. `document.scripts`에는 module script도 포함되므로 중복 순회하지 않는다. endpoint hint는 networking 권한이나 adapter registration의 근거가 아니며, 개발자는 제품 외의 정상 코드리뷰 절차로 실제 계약을 확인해야 한다.

### 4.3 명시적 협력 선언

사이트가 지속적으로 지원하려면 탐색 결과에 의존하지 말고, 개발자가 제공하는 versioned public API 계약을 adapter 코드와 함께 검토한다. 예를 들어 페이지는 공개 API version을 선언할 수 있지만, Browser는 그것을 실행하거나 자동 신뢰하지 않는다. adapter의 exact origin/path/version/action, closed enum argument, postcondition은 doc 27 registry에 번들로 들어가야 한다.

## 5. 실행 프로토콜

```ts
async function startDiscovery(bound: BoundPanel): Promise<DiscoveryResult> {
  const context = await resolveAndRecheckTopLevelDocument(bound);
  // context contains tabId, documentId, documentEpoch, pageScopeEpoch.
  const result = await chrome.scripting.executeScript({
    target: { tabId: context.tabId, documentIds: [context.documentId] },
    world: "MAIN",
    func: fixedRedactedDiscoveryScanner,
    args: [closedScanConfig],
  });
  return validateAndAcceptOnlyCurrentResult(result, context);
}
```

`closedScanConfig`는 bundle-defined cap과 approved root-name enum만 포함한다. raw selector, JavaScript path, URL, endpoint, header, user value를 받지 않는다. `fixedRedactedDiscoveryScanner`는 extension bundle의 자체 완결 함수이고, page-provided code나 downloaded code를 실행하지 않는다.

Injection result는 정확히 하나의 top-level document result여야 하며, 반환 `documentId`/`frameId`와 고정 context가 일치해야 한다. 값은 closed validator로 parse한다. MAIN exception, timeout, serialization failure, invalid candidate, page switch는 페이지 오류 문구·stack·반환 객체를 기록하지 않고 closed terminal code만 남긴다.

## 6. 예산·취소·결과 보관

| 항목                | v1 제한                   |
| ------------------- | ------------------------- |
| scan 총 budget      | 300 ms worker deadline    |
| approved root 수    | 최대 16                   |
| root당 own property | 최대 32                   |
| function hint       | 최대 64                   |
| inline script       | 개별 64 KiB, 합계 256 KiB |
| endpoint hint       | 최대 32                   |
| 동시 scan           | bound panel당 1개         |

cap 또는 자료 크기 제한에 걸리면 `truncated: true`를 반드시 반환한다. 결과가 partial/truncated이면 누락 없는 목록이나 API 존재 부재를 주장하지 않는다.

candidate mapping은 worker memory에만 두며 10분, navigation, page-scope 변경, panel close, Stop, terminal 중 먼저 발생한 시점에 폐기한다. `chrome.storage`, cache, Profile, diagnostics, chat history, export에는 저장하지 않는다. worker restart 뒤에는 `UNKNOWN`으로 끝내고 scan을 자동 복구하지 않는다.

## 7. UI와 source 선택

### 7.1 Ask/Act 분석 source 선택 — Proposed

4.1~4.2에서 발견한 source가 하나이고 reviewed read-only adapter가 `READY`면 Browser가 4.2에서 해당 source를 선택할 수 있다. unique collection의 전체 데이터 분석 의도는 `full` 범위까지 포함하며 capability permission과 진행/복구 안내를 표시한다. collection과 Page API read source가 복수이거나 안전하게 하나로 좁힐 수 없는 경우에만 Panel은 source를 선택하게 한다.

Panel은 adapter 없는 candidate에 대해 "adapter 검토 필요"만 표시한다. "호출", "이 후보로 분석", endpoint/URL 표시, raw script 보기, selector 입력은 제공하지 않는다. 선택된 source의 실제 data read와 Provider 전달은 27번/28번 및 32번의 4.3~4.4 계약을 따른다.

### 7.2 Profile Builder UX

```text
Page API Discovery (developer review only)
[ Scan public hints ]  [ Stop ]

Candidate: Public function hint A-12
Confidence: medium
Limitations: untrusted page metadata; not executed; adapter required
[ Mark adapter review needed ]

Candidate: Inline endpoint hint E-03
Method class: MUTATING_OR_UNKNOWN
Limitations: URL and request details are intentionally not retained; direct HTTP is disabled
[ Mark adapter review needed ]
```

UI는 "Test selected", "Add to Profile", "Invoke", "Scan All", endpoint/CORS/auth 표시를 제공하지 않는다. Browser의 `Mark adapter review needed`는 현재 dialog에만 일시적으로 표시한다. 외부 검토 작업 생성은 검토자 인증과 별도 계약이 확정된 뒤 연결하며 실행 가능한 Profile entry를 만들지 않는다.

모델은 Discovery 후보, label, evidence, raw page data를 보지 않는다. LLM assisted profiling은 v1 범위 밖이다. adapter가 나중에 번들에 등록된 뒤에도 모델에는 doc 27의 run-scoped opaque `action_ref`와 reviewed option enum만 노출한다.

## 8. Page Profile, read adapter 및 실행 연계

Discovery는 Page Profile에 `pageApis`를 자동 생성하거나 수정하지 않는다. 특히 다음 필드는 Discovery output이나 Profile runtime schema에 추가하지 않는다.

```text
path, ownerPath, selector, method, urlTemplate, urlPattern,
requestHeaders, requestBodySchema, responseSchema, websocket URL,
storage key/value, feature flag value, event payload schema
```

검토 완료 뒤 개발자가 adapter를 추가하면, 그것은 별도 source change다. read-only adapter는 32번의 `page_api_read` source로서 closed read schema, record/byte/cursor cap, data allowlist와 coverage/evidence를 가져야 한다. action adapter와 동일한 구현을 재사용할 수 있어도, read 결과를 action return value나 성공 판정으로 해석하지 않는다.

action 또는 read adapter는 doc 27의 다음 조건을 모두 충족해야 한다.

- exact HTTPS origin/path와 version을 bundle에서 검증한다.
- action은 reviewed label, closed `option_id` enum, effect/risk, independent UI postcondition을 가진다.
- 실행 직전에는 bound tab/document/page scope, approval digest, policy capability를 재검사한다.
- MAIN return value는 성공 근거가 아니며, 독립 semantic snapshot이 완료 조건을 검증한다.

REST, WebSocket/SSE, event, storage, custom element 직접 접근은 이 연계로도 허용되지 않는다. 그러한 후속 capability가 필요하면 separate threat model, origin allowlist, request schema, credential/CSRF model, enterprise policy, lifecycle, result redaction과 negative test를 포함한 신규 설계를 작성해야 한다.

## 9. Dynamic page 및 재검증

Discovery candidate는 document-bound ephemeral data이므로 page load 시 health check, HEAD/OPTIONS probe, CORS preflight, WebSocket ping, storage key check를 수행하지 않는다. 이런 network/page operation은 관측처럼 보이더라도 부수 효과와 권한 경계를 바꾼다.

후속 bundled adapter의 revalidation은 doc 27이 정의한 fixed adapter probe와 page-scope 검사만 사용할 수 있다. API endpoint 생존이나 server-side 업무 완료를 generic request로 추론하지 않는다.

## 10. 구현 모듈 경계

```text
extension/src/
  page-api/
    discovery/
      discovery-types.ts          // closed redacted result validator
      fixed-main-scanner.ts       // no arbitrary argument/code/network
      discovery-controller.ts     // document binding, cap, terminal ownership
      candidate-memory-store.ts   // current-run only, no chrome.storage
      candidate-scrubber.ts       // bounded label and secret/URL rejection
  sidepanel/
    profile-builder-discovery.ts  // explicit scan/stop/review-needed UI
```

이 모듈은 기존 `page-api/registry.ts`, `page-api-runner.ts`, Act executor 또는 provider path를 바꾸지 않는다. Discovery controller는 DOM collection reader, provider, persistent storage를 호출할 수 없다.

## 11. 수용 기준

| ID   | 시나리오                                                                | 기대                                                                                            |
| ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| D-01 | bound panel에서 public hint scan                                        | 현재 top-level document의 closed, redacted 후보만 표시                                          |
| D-02 | navigation/SPA scope 변경/worker restart                                | stale 결과 폐기, 자동 재시도·다른 문서 적용 없음                                                |
| D-03 | page getter, Proxy trap, MAIN hang/throw                                | 함수 호출 없음, worker terminal은 한 번, raw error/stack 기록 없음                              |
| D-04 | 64개 function 또는 source cap 초과                                      | `truncated: true`, complete/absence 주장 없음                                                   |
| D-05 | external script/module/source map                                       | fetch·다운로드·보관·분석 없음                                                                   |
| D-06 | URL, header, token, cookie, script text, storage value를 포함한 fixture | panel/model/diagnostics/storage/export에 원문 없음                                              |
| D-07 | endpoint/WS/event/storage/custom-element 후보                           | direct fetch/connect/dispatch/read/write 및 Test UI 없음                                        |
| D-08 | candidate review needed                                                 | executable Profile entry, adapter registry, model tool 변경 없음                                |
| D-09 | 나중에 reviewed adapter 등록                                            | doc 27의 exact binding, approval, closed enum, independent postcondition 검증을 통과해야만 실행 |

Chrome fixture는 D-01~D-09를 실제 unpacked `dist-extension`에서 확인해야 한다. fixture 성공은 실제 사이트 API, provider, server-side endpoint 지원의 증거가 아니다.

## 12. 단계

### Phase 1 — Closed discovery contract

- document/panel binding, closed terminal/result validator, ephemeral candidate store
- redaction/scrubbing과 persistent-storage/model/diagnostic exclusion
- D-01, D-02, D-04, D-06

### Phase 2 — Fixed scanner and review UI

- approved-root one-level function hint와 inline-script endpoint classification
- Stop, truncation, `adapter review needed` UX
- Proxy/exception/timeout fixture를 포함한 D-03, D-05, D-07, D-08

### Phase 3 — Adapter handoff verification

- Discovery와 독립된 bundled fixture adapter를 doc 27 계약으로 등록
- D-09 및 실제 Chrome fixture 증거

## 13. 근거

- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting): MAIN execution world와 `documentIds` injection target
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): isolated world와 MAIN world의 차이
- [Chrome cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests): host permission은 cross-origin request 권한이며, arbitrary URL을 background fetch로 넘기면 안 됨
- [Object.getOwnPropertyDescriptor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor): descriptor 기반 관측의 한계와 accessor 회피

본 문서는 Discovery 후보를 실행 경로로 승격하지 않는다. 실제 Page API invocation은 [doc 27](27-page-api-execution-design.md)의 bundled adapter 방식만 따른다.
