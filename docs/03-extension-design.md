# 03. Chrome MV3 확장 설계

## 1. 모듈

```text
extension/
  manifest.json
  src/service-worker/  # run coordinator, permission gate, provider client
  src/content/         # projection, ref registry, DOM executor
  src/sidepanel/       # task, permission card, confirmation, result
  src/settings/        # provider, headers, site permissions
  src/security/        # redaction, validators, intent digest
  src/contracts/       # runtime and provider schemas
```

의존성은 `sidepanel/content → service-worker → contracts/security`다. network 요청은 service worker provider client만 수행한다.

## 2. Manifest

- Chrome MV3 service worker와 Side Panel을 사용한다.
- 페이지 automation이 필요하므로 content script와 host permission은 사용자가 설치 시 승인한다.
- `storage`, `tabs`, `scripting`, `activeTab`, `webNavigation`, `downloads`, `alarms`는 도구가 실제 사용할 때만 포함한다.
- host permission은 WebBrain 호환 broad page access를 제공할 수 있으며, 실제 실행은 capability × host gate가 제한한다.

## 3. 사용자 설정 저장소

Settings와 service worker는 `chrome.storage.local`을 사용한다. content script는 storage를 직접 읽지 않는다.

```json
{
  "providers": {
    "local": {
      "type": "openai_compatible",
      "label": "Company Local LLM",
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
  "wb_permissions": [],
  "askBeforeConsequentialActions": true
}
```

`api_key_header`의 값은 `authorization_bearer`, `api-key`, `x-goog-api-key`만 허용한다. request builder는 각각 `Authorization: Bearer <key>`, `api-key: <key>`, `x-goog-api-key: <key>`를 만든다. 정적 `headers`는 user agent와 model output에서 분리되며 key와 header 값은 password UI 이외에 다시 표시하지 않는다.

## 4. 문서·도구 계약

content script는 `DOCUMENT_REGISTER`, `CONTENT_SNAPSHOT`, `EXECUTE_ACTION`, `VERIFY_RESULT`만 service worker와 교환한다. sender의 tab, frame, `documentId`, lifecycle을 Chrome API로 검증한다.

snapshot에는 redacted role/name/state, document-scoped `ref_id`와 제한된 relation만 들어간다. service worker는 모델 호출 직전에 `ref_id`를 current-run `model_ref`로 치환하고 terminal transition·navigation·worker restart에 즉시 폐기한다.

## 5. 값과 확인

텍스트와 select 값은 모델이 target을 제안한 뒤 Side Panel에서 사용자가 제공한다. raw value는 Side Panel, service worker, content script의 현재 action에만 전달하고 storage, provider 요청, audit에는 넣지 않는다. 제출과 R2 행동은 현재 target·값 digest·문서 epoch에 결속된 사용자 확인 뒤에만 실행한다.
