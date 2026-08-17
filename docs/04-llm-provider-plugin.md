# 04. LLM provider plugin과 인증

## 1. 목표와 범위

LLM provider는 extension core와 분리된 plugin으로 개발·등록·선택할 수 있다. 첫 내장 plugin은 OpenAI-compatible `chat_completions`와 `responses`를 지원한다. plugin화는 protocol과 capability의 확장 경계이며 인증 모델을 확장하는 수단이 아니다.

지원하는 provider 인증은 현재와 동일하다.

- API key 없음
- `Authorization: Bearer <key>`
- `api-key: <key>`
- `x-goog-api-key: <key>`
- 사용자가 Settings에 입력한 검증된 정적 header

제품 계정, provider OAuth/PKCE, refresh token, browser cookie 전달, Cloud Sync와 plugin 자체 secret store는 지원하지 않는다.

## 2. plugin 종류

| 종류               | 설치 방식                                                    | 실행 가능 범위                                                           |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| declarative plugin | Settings에서 `.wb-provider.json` import                      | core가 제공하는 OpenAI-compatible request/response adapter의 옵션만 선언 |
| bundled adapter    | source package에 추가하고 extension과 함께 build/review/sign | plugin SDK로 request plan과 response parser 구현                         |

Chrome MV3의 remote-code 금지 경계를 유지하기 위해 runtime import는 JSON manifest만 허용한다. 다운로드한 JavaScript/WASM, 동적 remote import, `eval`과 문자열 code generation은 plugin으로 실행하지 않는다. 별도 protocol code가 필요한 provider는 bundled adapter로 개발해 새 extension release에 포함한다.

## 3. plugin manifest

선언형 plugin manifest는 closed JSON schema다.

```json
{
  "schema_version": 1,
  "id": "example.local-openai",
  "version": "1.0.0",
  "display_name": "Example Local LLM",
  "runtime": "declarative_openai_compatible",
  "provider_api_version": 1,
  "wire_apis": ["chat_completions", "responses"],
  "auth_schemes": ["none", "authorization_bearer", "api-key", "x-goog-api-key"],
  "capabilities": {
    "streaming": true,
    "tools": true
  },
  "defaults": {
    "base_url": "http://127.0.0.1:8080/v1",
    "wire_api": "chat_completions",
    "timeout_ms": 60000
  }
}
```

규칙은 다음과 같다.

- `id`는 소문자 reverse-domain 또는 충돌 없는 dotted ID, `version`은 SemVer다.
- 알 수 없는 field, 중복 ID, 지원하지 않는 API version, 과도한 문자열·배열은 거부한다.
- `base_url` 기본값은 secret을 포함할 수 없으며 사용자 Settings가 최종 값을 소유한다.
- `auth_schemes`는 core enum의 부분집합만 선언할 수 있다. header 이름, token endpoint, OAuth scope와 인증 code를 추가할 수 없다.
- manifest는 prompt, system message, tool description과 임의 request header를 포함할 수 없다.
- capability는 provider가 처리할 수 있는 wire 기능을 말하며 browser tool 권한을 부여하지 않는다.
- manifest, bundled adapter와 provider response는 CDP method, selector, 좌표, execution path와 browser permission을 선언하거나 확장할 수 없다.
- Settings importer는 `runtime: declarative_openai_compatible`만 받는다. `bundled_adapter` manifest는 generated build registry에서만 신뢰한다.

## 4. ProviderConfig

사용자는 plugin을 선택해 provider instance를 만든다.

| 항목             | 규칙                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `plugin_id`      | 설치된 manifest 또는 bundled adapter ID                           |
| `plugin_version` | 설정을 마지막으로 검증한 plugin version                           |
| `base_url`       | HTTPS, localhost, loopback 또는 사용자가 opt-in한 사설망 endpoint |
| `wire_api`       | plugin이 선언한 `chat_completions` 또는 `responses`               |
| `model`          | 사용자가 선택한 문자열                                            |
| `api_key`        | 선택 또는 필수. `chrome.storage.local`에 저장                     |
| `api_key_header` | `authorization_bearer`, `api-key`, `x-goog-api-key`               |
| `headers`        | 사용자가 설정한 정적 `{name,value}` 목록                          |
| `timeout_ms`     | core가 적용하는 요청 제한                                         |

기존 `type: openai_compatible` 설정은 설치 시 내장 `contextpilot.openai-compatible@1` plugin을 가리키도록 one-way migration한다. 원본 key/header 값은 변경하지 않는다.

## 5. 실행 경계

```text
Run coordinator
  → provider registry가 plugin/config 호환성 확인
  → plugin host가 secret 없는 normalized request를 request plan으로 변환
  → core가 URL/path/body/header를 검증
  → core가 API key와 Settings static header를 마지막에 주입
  → core HTTP transport가 fetch/stream/cancel 수행
  → plugin parser가 response를 normalized provider event로 변환
  → core가 tool call schema와 run registry를 검증
```

Ask chat은 `system`, redacted projection을 포함한 `user`, `assistant`, `tool` message와 provider function schema를 사용한다. 첫 turn에는 현재 페이지 projection을 전달하므로 tool calling을 지원하지 않는 compatible model도 현재 화면 질의에 답할 수 있다. tool calling을 지원하는 model은 `read_semantic_projection` 또는 서명된 Page Profile이 허용한 Business MCP read tool을 호출할 수 있고, core가 닫힌 schema와 Profile binding을 다시 검증한다. projection과 Business MCP result는 시스템 지시가 아닌 untrusted data다.

plugin이 반환하는 request plan에는 상대 path, wire API, JSON body와 response mode만 포함한다. plugin은 다음을 할 수 없다.

- `fetch`, WebSocket 또는 browser API 직접 호출
- API key, static header 값, cookie와 browser credential 조회
- `base_url`의 origin 변경 또는 임의 redirect 승인
- model tool schema 추가, capability gate 우회 또는 action 실행
- audit, diagnostics, export에 임의 값을 기록

core는 `Content-Type: application/json`을 고정한다. API key가 있으면 선택된 scheme으로 header를 추가하고 Settings의 static header를 이어서 추가한다. `Content-Type`, `Authorization`, `api-key`, `x-goog-api-key` 중복과 header의 CR/LF·제어 문자·빈 이름/값을 거부한다.

## 6. plugin SDK

bundled adapter는 아래 논리 계약을 구현한다.

```ts
type ProviderPlugin = {
  manifest: ProviderPluginManifest;
  validate(config: PublicProviderConfig): ValidationResult;
  buildRequest(input: NormalizedProviderRequest): ProviderRequestPlan;
  parseResponse(input: ProviderResponseInput): AsyncIterable<ProviderEvent>;
  buildHealthCheck(config: PublicProviderConfig): ProviderRequestPlan;
};
```

`PublicProviderConfig`에는 API key와 static header 값이 없다. `ProviderRequestPlan`은 structured-clone 가능한 plain data이며 function, class instance, stream과 credential을 포함할 수 없다. plugin 예외는 `PROVIDER_PLUGIN_FAILED`로 정규화하고 stack·body·secret을 UI에 노출하지 않는다.

## 7. 설치, 선택과 lifecycle

1. Settings가 manifest 파일을 읽고 closed schema와 크기 제한을 검증한다.
2. registry가 ID/version/API compatibility를 확인한다.
3. 사용자가 plugin을 명시적으로 enable하고 provider instance를 만든다.
4. 연결 시험이 실제 active provider와 같은 core transport/auth 경로를 사용한다.
5. plugin disable/removal 시 연결된 provider를 비활성화하되 설정과 secret은 자동 삭제하지 않고 사용자에게 선택권을 준다.
6. major version 불일치는 자동 migration하지 않는다. provider를 비활성화하고 다시 저장하도록 요청한다.

plugin update는 권한을 자동 확대하지 않는다. 새 wire API, auth scheme 또는 capability가 추가되면 Settings에 diff를 표시하고 사용자가 다시 승인해야 한다.

## 8. plugin 개발과 결합 절차

별도 protocol을 지원하는 executable plugin은 다음 구조의 workspace package로 개발한다.

```text
provider-plugins/<plugin-id>/
  provider.plugin.json
  src/index.ts
  tests/conformance.test.ts
```

1. 개발자는 `provider_api_version: 1` manifest와 `ProviderPlugin` adapter를 작성한다.
2. conformance test는 import side effect, direct network/storage/browser API 사용, absolute URL request plan과 secret 접근을 거부한다.
3. build가 manifest와 entry의 ID/version 일치, closed schema와 SDK compatibility를 확인한다.
4. 검증을 통과한 package만 generated bundled registry에 추가한다.
5. extension과 함께 build·review·서명해 배포한다. adapter만 독립적으로 내려받아 기존 extension에 실행 code로 삽입하지 않는다.

OpenAI-compatible endpoint를 추가하는 개발자는 executable adapter 대신 선언형 manifest를 작성한다. manifest validator와 local provider fixture를 통과한 파일은 extension 재빌드 없이 Settings에서 설치할 수 있다.

## 9. 오류와 연결 시험

Settings의 연결 시험은 active provider와 동일한 plugin, URL, header, wire, timeout 경로로 작은 요청을 보낸다. 401/403은 key/header 설정 오류, plugin/version 불일치는 plugin 오류, timeout·TLS·response schema 오류는 provider 연결 오류로 표시한다. 오류 detail에는 API key, header 값, prompt, page content와 raw response body를 넣지 않는다.
