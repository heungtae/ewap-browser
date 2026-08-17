# 12. 구현 실행 명세

## 1. 기술 구성

| 영역      | 선택                                                            |
| --------- | --------------------------------------------------------------- |
| extension | TypeScript strict, Chrome MV3, esbuild                          |
| browser   | content script DOM executor + Level 2 bounded CDP adapter       |
| provider  | plugin registry/host + core HTTP/streaming transport            |
| plugin    | closed JSON manifest 또는 build-time bundled TypeScript adapter |
| state     | service worker memory + `chrome.storage.local`                  |
| test      | Vitest, manifest/provider fixture, Chrome E2E                   |
| package   | Node 22 LTS, pnpm 9                                             |

## 2. plugin manifest와 registry

```ts
type WireApi = "chat_completions" | "responses";
type ApiKeyHeader = "authorization_bearer" | "api-key" | "x-goog-api-key";

type ProviderPluginManifest = {
  schemaVersion: 1;
  id: string;
  version: string;
  displayName: string;
  runtime: "declarative_openai_compatible" | "bundled_adapter";
  providerApiVersion: 1;
  wireApis: WireApi[];
  authSchemes: Array<"none" | ApiKeyHeader>;
  capabilities: {
    streaming: boolean;
    tools: boolean;
  };
  defaults?: {
    baseUrl?: string;
    wireApi?: WireApi;
    timeoutMs?: number;
  };
};
```

`ProviderRegistry`는 extension package의 bundled adapter와 `chrome.storage.local.provider_plugins`의 선언형 manifest를 하나의 ID/version index로 구성한다. 선언형 manifest는 JSON data일 뿐 실행하지 않는다. Settings import의 `bundled_adapter` 선언은 거부하고 build-generated registry에서 온 adapter만 실행한다. registry는 duplicate ID, invalid SemVer, unknown field, API version mismatch와 지원하지 않는 runtime을 거부한다.

## 3. ProviderConfig와 secret 분리

```ts
type ProviderHeader = { name: string; value: string };

type ProviderConfig = {
  id: string;
  pluginId: string;
  pluginVersion: string;
  label: string;
  baseUrl: string;
  wireApi: WireApi;
  model: string;
  apiKey?: string;
  apiKeyHeader?: ApiKeyHeader;
  headers: ProviderHeader[];
  timeoutMs: number;
  enabled: boolean;
};

type PublicProviderConfig = Omit<ProviderConfig, "apiKey" | "headers"> & {
  hasApiKey: boolean;
  staticHeaderNames: string[];
};
```

`ProviderConfig`는 `chrome.storage.local.providers`에 저장한다. UI는 API key와 header value를 password field로 입력하며 provider 목록, plugin host와 diagnostics에는 `PublicProviderConfig`만 반환한다. 사용 가능한 인증 방식은 기존 세 방식으로 고정하고 plugin별 `authSchemes`는 그 부분집합만 허용한다.

## 4. plugin SDK와 실행 격리

```ts
type ProviderPlugin = {
  manifest: ProviderPluginManifest;
  validate(config: PublicProviderConfig): ValidationResult;
  buildRequest(input: NormalizedProviderRequest): ProviderRequestPlan;
  parseResponse(input: ProviderResponseInput): AsyncIterable<ProviderEvent>;
  buildHealthCheck(config: PublicProviderConfig): ProviderRequestPlan;
};

type ProviderRequestPlan = {
  relativePath: string;
  wireApi: WireApi;
  body: JsonValue;
  responseMode: "json" | "sse";
};
```

plugin host에는 frozen plain data만 전달한다. `ProviderRequestPlan`의 unknown field, absolute URL, credential-shaped field, function/class instance와 지원하지 않는 response mode는 거부한다. plugin은 browser API, storage, DOM, raw provider secret과 직접 network primitive를 받지 않는다.

bundled adapter는 동일 interface를 구현하지만 extension source에 포함되어 build-time registry에 명시적으로 등록된 code만 실행한다. runtime manifest import로 executable adapter를 추가할 수 없다.

## 5. core transport

1. registry가 `pluginId`, `pluginVersion`, provider API compatibility와 enabled 상태를 확인한다.
2. plugin host가 secret 없는 normalized input으로 `ProviderRequestPlan`을 만든다.
3. core가 `baseUrl`과 relative path를 결합하고 최종 URL을 검증한다. `http:`는 loopback 또는 private-network opt-in endpoint만 허용한다.
4. core가 `Content-Type: application/json`을 추가한다.
5. API key가 있으면 `Authorization: Bearer`, `api-key`, `x-goog-api-key` 중 선택된 방식으로 추가한다.
6. Settings static header를 추가한다. 예약 header 중복, CR/LF, 제어 문자, 빈 이름·값은 거부한다.
7. core transport만 HTTP/streaming, redirect policy, timeout과 cancellation을 수행한다.
8. plugin parser가 response를 `ProviderEvent`로 정규화하고 core가 tool schema와 current-run mapping을 다시 검증한다.
9. diagnostics는 plugin ID/version, URL origin, status와 reason code만 남긴다.

## 6. lifecycle과 migration

- 기존 `type: "openai_compatible"` provider는 `webbrain.openai-compatible@1`로 one-way migration한다.
- plugin이 없거나 disabled이면 연결된 provider를 `PROVIDER_PLUGIN_NOT_FOUND`로 비활성화한다.
- provider API 또는 plugin major version이 맞지 않으면 `PROVIDER_PLUGIN_INCOMPATIBLE`로 비활성화한다.
- plugin update가 wire API, auth scheme 또는 capability를 늘리면 사용자가 Settings diff를 승인하기 전까지 기존 범위만 유지한다.
- plugin 제거는 provider secret을 자동 삭제하지 않는다. Settings가 연결된 provider 목록과 삭제 선택지를 먼저 보여준다.
- manifest import/export에는 secret과 executable code를 포함하지 않는다.

## 7. permission gate

`PermissionManager`는 `wb_permissions`의 `{capability, host, action, duration}`을 읽는다. `duration: once`는 run 종료 때 폐기하고 `duration: always`만 저장한다. gated tool은 target host를 확인할 수 없으면 거부한다. provider/plugin capability는 browser 행동 권한이 아니며 capability gate에 grant를 추가할 수 없다. master preference가 꺼져도 R2/R3의 explicit confirmation은 유지한다.

## 8. runtime message

`START_ASK`, `START_ACT`, `CONTENT_SNAPSHOT`, `EXECUTE_ACTION`, `PREPARE_BOUNDED_CDP_TARGET`, `CLEAR_BOUNDED_CDP_TARGET`, `VERIFY_RESULT`, `PERMISSION_DECISION`, `CONFIRM`, `CANCEL`, `PLUGIN_INSTALL`, `PLUGIN_SET_ENABLED`, `PROVIDER_SAVE`, `PROVIDER_TEST`는 각 `kind`별 closed schema를 사용한다. UI sender와 content sender를 `sender.id`, tab, frame, document ID로 검증한다. raw provider 설정, plugin executable code와 action value는 runtime message에 포함하지 않는다. provider 저장은 secret write 전용 message와 redacted read model을 분리한다.

CDP prepare message는 permission/confirmation을 통과한 service worker가 current run/action/document/ref와 일회용 token을 content script에 전달하는 내부 message다. content script는 target을 다시 확인하고 token marker를 만든 뒤 성공/실패만 반환한다. clear message는 동일 binding에만 marker cleanup을 허용한다. Side Panel, page script, provider/plugin과 다른 tab/frame sender가 이 message를 보내면 거부한다.

## 9. bounded CDP adapter

`BoundedCdpAdapter`는 service worker 내부 interface이며 runtime/tool schema로 노출하지 않는다.

```ts
type BoundedCdpMethod =
  | "DOM.enable"
  | "DOM.disable"
  | "DOM.getDocument"
  | "DOM.querySelectorAll"
  | "DOM.scrollIntoViewIfNeeded"
  | "DOM.getBoxModel"
  | "DOM.getNodeForLocation"
  | "DOM.getAttributes"
  | "DOM.focus"
  | "Input.dispatchMouseEvent"
  | "Input.dispatchKeyEvent"
  | "Input.insertText";

type CdpExecutionPath = "dom" | "bounded_cdp";
```

raw `method: string` API를 만들지 않는다. tool별 typed method가 fixed parameter builder를 호출하며 model/provider/content message의 extra CDP field는 schema validation에서 거부한다. selector는 content script가 만든 current-action token의 고정 prefix와 escaped token으로만 구성한다. 좌표는 bound node의 CDP box와 hit test에서 계산하며 외부 입력을 받지 않는다.

adapter는 permission과 R2 confirmation이 끝난 뒤 attach하고 `try/finally`에서 detach한다. input dispatch 여부를 별도로 기록해 dispatch 전 failure는 `FAILED`, dispatch 후 불명확한 failure는 `UNKNOWN`으로 분류한다. dispatch 이후 DOM/CDP fallback과 자동 재시도는 금지한다. 상세 계약과 negative test는 [15. Bounded CDP adapter](15-bounded-cdp-adapter.md)를 따른다.
