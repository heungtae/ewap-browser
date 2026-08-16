# 12. 구현 실행 명세

## 1. 기술 구성

| 영역      | 선택                                           |
| --------- | ---------------------------------------------- |
| extension | TypeScript strict, Chrome MV3, esbuild         |
| provider  | OpenAI-compatible HTTP/streaming client        |
| state     | service worker memory + `chrome.storage.local` |
| test      | Vitest, local provider fixture, Chrome E2E     |
| package   | Node 22 LTS, pnpm 9                            |

## 2. ProviderConfig

```ts
type ApiKeyHeader = "authorization_bearer" | "api-key" | "x-goog-api-key";
type ProviderHeader = { name: string; value: string };
type ProviderConfig = {
  id: string;
  type: "openai_compatible";
  label: string;
  baseUrl: string;
  wireApi: "chat_completions" | "responses";
  model: string;
  apiKey?: string;
  apiKeyHeader?: ApiKeyHeader;
  headers: ProviderHeader[];
  timeoutMs: number;
  enabled: boolean;
};
```

`ProviderConfig`는 `chrome.storage.local.providers`에 저장한다. UI는 API key와 header value를 password field로 입력하며 provider 목록 응답에는 redacted 상태만 반환한다.

## 3. request builder

1. `baseUrl`을 URL로 parse하고 `http:`는 loopback 또는 private-network opt-in endpoint에만 허용한다.
2. `Content-Type: application/json`을 추가한다.
3. API key가 있으면 header 방식에 따라 `Authorization: Bearer`, `api-key`, `x-goog-api-key` 중 하나를 추가한다.
4. Settings `headers`를 추가한다. 예약 header 이름 중복, CR/LF, 제어 문자, 빈 이름·값은 거부한다.
5. `wireApi`에 따라 endpoint와 body를 만들고 timeout/cancellation을 적용한다.
6. request/response diagnostics는 URL origin, status, reason code만 남긴다.

## 4. permission gate

`PermissionManager`는 `wb_permissions`의 `{capability, host, action, duration}`을 읽는다. `duration: once`는 run 종료 때 폐기하고 `duration: always`만 저장한다. gated tool은 target host를 확인할 수 없으면 거부한다. master preference가 꺼져도 R2/R3의 explicit confirmation은 유지한다.

## 5. runtime message

`START_ASK`, `START_ACT`, `CONTENT_SNAPSHOT`, `EXECUTE_ACTION`, `VERIFY_RESULT`, `PERMISSION_DECISION`, `CONFIRM`, `CANCEL`은 각 `kind`별 closed schema를 사용한다. UI sender와 content sender를 `sender.id`, tab, frame, document ID로 검증한다. raw provider 설정과 action value는 runtime message에 포함하지 않는다.
