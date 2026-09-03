# 03. Chrome MV3 확장 설계

## Enterprise Web AI Platform 정렬 (2026-08-31)

Extension은 Enterprise Data Plane의 Browser Runtime이다. 기존 MV3 모듈에
다음 integration port를 추가한다.

-   `ProfileResolverClient`: signed Page Profile
    resolve/cache/revocation 확인
-   `EnterprisePolicyClient`: PDP decision/approval constraint 조회
-   `McpRegistryClient` 또는 Enterprise MCP Gateway client: `serverRef`
    해석과 discovery
-   `EnterpriseAuditSink`: redacted Runtime Evidence/AuditEvent 전송
-   `ManagedConfigAdapter`: enterprise Chrome managed storage/policy
    적용

`chrome.storage.session`에는 복구 가능한 redacted ownership metadata만
두며 modelRef, raw ref/node/coordinate/action value는 복구하지 않는다.
Profile/Policy/MCP 연결 장애가 write path에 영향을 주면 fail-closed한다.

## 1. 모듈

``` text
extension/
  manifest.json
  src/service-worker/  # run coordinator, permission gate, provider host/transport
  src/offscreen/       # localhost/PNA provider request proxy
  src/content/         # projection, ref registry, DOM executor
  src/cdp/             # bounded mutation allowlist와 input 없는 Vision capture
  src/sidepanel/       # task, permission card, confirmation, result
  src/settings/        # provider plugin, headers, site permissions
  src/providers/       # registry, plugin SDK, built-in adapters
  src/security/        # redaction, validators, intent digest
  src/contracts/       # runtime and provider schemas
```

별도 protocol adapter는 `provider-plugins/<plugin-id>/` workspace
package로 개발하고 build 단계에서 generated registry에 결합한다. 각
package는 manifest, side-effect 없는 adapter entry와 conformance test를
가진다. 선언형 plugin은 source package 없이 manifest만 설치한다.

의존성은
`sidepanel/content → service-worker → offscreen provider proxy → provider registry/plugin host → core transport → contracts/security`다.
provider의 localhost/PNA POST는 Offscreen 문서의 core transport가
수행하고, plugin은 `chrome.*`, DOM, CDP, storage와 raw credential에
접근하지 않는다. Offscreen은 provider 요청에만 사용하며 비밀값은 runtime
message로 전달하지 않고 `chrome.storage.local` 경계에서 읽는다.

## 2. Manifest

-   Chrome MV3 service worker와 Side Panel을 사용한다.
-   페이지 automation이 필요하므로 content script와 host permission은
    사용자가 설치 시 승인한다.
-   `storage`, `sidePanel`, `activeTab`, `debugger`, `tabs`를 제품
    기능에 필요한 기본 권한으로 선언한다. `tabs`는 [19번
    문서](19-tab-scoped-chat-session-design.md)의 tab thread lifecycle과
    URL stale 처리를 위한 것이며 manifest snapshot review를 거쳤다.
    `scripting`, `webNavigation`, `downloads`, `alarms`는 실제 요구가
    생길 때만 별도 review 뒤에 추가한다. PageScope 감지는
    `DOCUMENT_REGISTER`, `PAGE_SCOPE_REGISTER`, URL 변화로 충족하므로
    `webNavigation`은 보류한다.
-   일반 웹 UI를 지원하므로 host permission과 content script는
    `<all_urls>`를 사용한다. 브라우저 제한 페이지(`chrome://`, Web Store
    등)는 Chrome이 주입을 차단한다. service worker는 current active
    tab의 `http(s)` origin과 capability × host gate를 다시 확인하고,
    provider egress와 Profile Resolver 허용 origin은 별도 allowlist로
    유지한다.
-   `offscreen`은 MV3 Service Worker의 localhost/PNA provider POST
    프록시를 위해 선언한다. `privateNetworkAccess`는 Chrome 확장
    manifest permission이 아니므로 선언하지 않는다. host permission에는
    `<all_urls>`와 함께 `http://localhost/*`, `http://127.0.0.1/*`를
    명시한다. 외부 Chrome E2E의 remote-debugging port는 제품 manifest
    권한이 아니다.

## 3. 사용자 설정 저장소

Settings와 service worker는 `chrome.storage.local`을 사용한다. content
script는 storage를 직접 읽지 않는다.

``` json
{
  "providers": {
    "local": {
      "plugin_id": "contextpilot.openai-compatible",
      "plugin_version": "1.0.0",
      "label": "Local OpenAI-compatible LLM",
      "base_url": "http://127.0.0.1:8080/v1",
      "wire_api": "chat_completions",
      "model": "qwen",
      "api_key": "",
      "api_key_header": "authorization_bearer",
      "headers": [{ "name": "X-Company-Client", "value": "webbrain" }],
      "enabled": true
    }
  },
  "activeProvider": "local",
  "contextpilot_permissions": [],
  "askBeforeConsequentialActions": true,
  "agent_preferences": {
    "permission_mode": "standard",
    "default_read_scope": "all_dom",
    "screenshot_policy": "manual_or_model",
    "group_tools_in_timeline": true,
    "show_tool_debug_details": false
  }
}
```

`api_key_header`의 값은 `authorization_bearer`, `api-key`,
`x-goog-api-key`만 허용한다. request builder는 각각
`Authorization: Bearer <key>`, `api-key: <key>`,
`x-goog-api-key: <key>`를 만든다. 정적 `headers`는 user agent와 model
output에서 분리되며 key와 header 값은 password UI 이외에 다시 표시하지
않는다.

`provider_plugins`에는 검증된 선언형 manifest와 enabled 상태만 저장한다.
bundled adapter의 실행 코드는 extension package에 포함되며 storage에
저장하지 않는다. 설정을 읽을 때 registry는 `plugin_id`, API version과
설치된 plugin version을 확인하고, 없거나 호환되지 않으면 provider를
비활성화한다.

## 4. 문서·도구 계약

content script는 `DOCUMENT_REGISTER`, `CONTENT_SNAPSHOT`,
`EXECUTE_ACTION`, `PREPARE_BOUNDED_CDP_TARGET`,
`CLEAR_BOUNDED_CDP_TARGET`, `VERIFY_RESULT`만 service worker와 교환한다.
sender의 tab, frame, `documentId`, lifecycle을 Chrome API로 검증한다.
CDP prepare/clear message는 service worker만 시작할 수 있고 Side Panel,
page와 provider sender는 거부한다.

schema v2 snapshot에는 role/name/state, `visibility`와 hidden reason,
document-scoped `ref_id`, 제한된 relation과 최대 12,000자의 보이는
페이지 텍스트가 들어간다. 기본 scope는 `all_dom`이며 hidden DOM도
semantic node로 포함한다. raw HTML/CSS/script, input current value,
password/OTP/token value와 browser credential은 scope와 무관하게
포함하지 않는다. service worker는 모델 호출 직전에 `ref_id`를
current-run `model_ref`로 치환하고 terminal transition·navigation·worker
restart에 즉시 폐기한다. hidden model ref는 read focus에만 등록하고
mutation mapping에는 등록하지 않는다.

Side Panel은 provider wire message가 아니라 [17번
문서](17-claude-browser-capability-adoption-design.md)의 sequence가 있는
closed `ChatEvent`만 받는다. reconnect나 sequence gap은 `CHAT_RESYNC`
snapshot으로 복구하고 Stop 이후 event는 같은 run transcript를 변경하지
못한다.

탭별 Chat Session을 구현하면 closed `ChatEvent`는
session/thread/tab/run/sequence envelope로 route하며, 복구와
transcript는 현재 활성 탭의 현재 thread로 제한한다. 이 계획의 문맥
저장·redaction·quota·삭제 계약은 [19번
문서](19-tab-scoped-chat-session-design.md)와 [06번
문서](06-data-audit-and-privacy.md)를 따른다.

bounded CDP 경로에서 content script는 preflight가 끝난 target 또는 실제
hit node에 128-bit 이상 무작위 action token을 일시적으로 표시한다.
service worker는 token을 모델에 노출하지 않고 current run/action과
결속하며, CDP adapter는 정확히 하나의 live node만 해석한다. token은
dispatch 성공 여부와 관계없이 content script `finally`에서 제거한다.
페이지가 token을 복제·이동해 유일성 또는 hit test가 깨지면 실행하지
않는다.

CDP command와 parameter는 service worker의 typed builder만 생성한다.
content script와 Side Panel은 raw command message를 보내지 않으며
provider response에 CDP-shaped field가 있으면 unknown field로 거부한다.
세부 계약은 [15. Bounded CDP adapter](15-bounded-cdp-adapter.md)를
따른다.

## 5. 값과 확인

텍스트와 select 값은 모델이 target을 제안한 뒤 Side Panel에서 사용자가
제공한다. raw value는 Side Panel, service worker, content script의 현재
action에만 전달하고 storage, provider 요청, audit에는 넣지 않는다.
제출과 R2 행동은 현재 target·값 digest·문서 epoch에 결속된 사용자 확인
뒤에만 실행한다.

CDP `Input.insertText`가 필요한 경우에도 raw value의 수명과 노출 범위는
동일하다. adapter는 이미 확인된 현재 action의 ephemeral value만 받고
command 완료 직후 참조를 폐기한다. CDP path 선택이나 attach는 R2
confirmation을 대신하거나 confirmation binding을 변경하지 않는다.
