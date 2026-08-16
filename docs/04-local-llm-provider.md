# 04. Local LLM 제공자와 요청 header

## 1. OpenAI 호환 provider

각 provider는 사용자가 Settings에서 만들고 선택한다. 지원 wire는 `chat_completions`와 `responses`다. provider마다 base URL, model, timeout, API key, API key header 방식, 정적 request header를 독립적으로 가진다.

| 항목             | 규칙                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| `base_url`       | OpenAI 호환 `/v1` base URL. HTTPS, localhost, loopback, 사설망 endpoint 허용 |
| `wire_api`       | `chat_completions` 또는 `responses`                                          |
| `model`          | 사용자가 선택한 문자열                                                       |
| `api_key`        | 선택 또는 필수. local storage에 저장                                         |
| `api_key_header` | `authorization_bearer`, `api-key`, `x-goog-api-key`                          |
| `headers`        | 사용자가 설정한 정적 `{name,value}` 목록                                     |

## 2. 요청 작성

```text
Content/Side Panel
  → Service worker
  → provider config를 읽어 header와 JSON body 작성
  → Local OpenAI-compatible endpoint
```

기본 request header는 `Content-Type: application/json`이다. API key가 있으면 선택된 방식의 header를 추가한다. 이어서 정적 header 목록을 추가한다. `Content-Type`, `Authorization`, `api-key`, `x-goog-api-key`는 API key 방식과 충돌하지 않도록 중복을 거부한다. header 이름·값의 CR/LF와 제어 문자는 거부한다.

## 3. 사용자 인증

Local LLM이 API key와 정적 header를 요구하면 사용자가 해당 값을 provider 설정에 넣는다. 브라우저 웹사이트 로그인은 사용자가 현재 Chrome 세션에서 직접 완료하며 WebBrain은 password·OTP·보안코드를 다루지 않는다.

## 4. 오류와 연결 시험

Settings의 연결 시험은 active provider와 같은 URL·header·wire로 작은 요청을 보낸다. 401/403은 key/header 설정 오류로 표시하고, timeout·TLS·응답 schema 오류는 provider 연결 오류로 표시한다. 오류 detail에는 API key, header 값, prompt, page content를 넣지 않는다.
