# 01. 시스템 아키텍처

## 1. 제품 모델

ContextPilot은 한 사용자가 자신의 Chrome profile에 설치해 현재 브라우저 세션과 선택한 LLM provider를 연결하는 로컬 단일 사용자용 MV3 브라우저 에이전트다. 사용자는 Settings에서 provider plugin, 모델 연결과 실행 권한을 직접 관리한다.

제품 경계는 다음과 같다.

- 현재 Chrome profile을 사용하는 한 명의 로컬 사용자가 설치·설정·승인의 주체다.
- 웹사이트 인증은 현재 Chrome 로그인 세션을 사용한다. 제품 계정, SSO, 조직 RBAC, service account와 사용자 대행 token은 제공하지 않는다.
- 공유 kiosk, 다중 사용자 profile, 중앙 작업 실행, headless multi-tenant 서비스와 Cloud Sync는 지원 범위가 아니다.
- WebBrain의 Ask/Act와 capability × host 사용자 승인 모델을 따르되, password·OTP 처리 금지와 R2/R3 확인 정책은 유지한다.
- LLM provider는 plugin으로 교체할 수 있지만 인증 정보와 HTTP 실행은 extension core가 소유한다.

## 2. 논리 구성

```text
Side Panel ─────────────┐
Content script ─────────┼── Service worker ── Provider registry/plugin host ── Core HTTP transport ── LLM
                         │          │
                         │          ├── Bounded CDP adapter ── chrome.debugger ── current target tab
                         │          ├── chrome.storage.local
                         │          │    plugin manifest / provider settings / API key / headers / user permissions
                         │          └── current Chrome tab and its logged-in session
                         └── Settings
```

### Side Panel

사용자는 Ask 또는 Act 작업을 시작하고, provider plugin, 모델, 사이트별 권한, 확인 요청과 실행 결과를 본다. 비밀값은 Settings의 password input에서만 편집하며 Side Panel의 대화·감사 화면에 표시하지 않는다.

### Content script

현재 문서에서 semantic projection과 문서 범위 `ref_id`를 만들고, service worker가 허용한 단일 DOM 작업만 실행한다. 페이지 DOM, 이벤트, `postMessage`와 모든 페이지 텍스트는 비신뢰 입력이다.

### Service worker

작업 상태, 모델 요청, capability × host 권한 검사, 사용자 확인, `model_ref → ref_id` 매핑, 실행 전 preflight, DOM 또는 bounded CDP 실행 경로 선택과 실행 후 상태 검증을 담당한다. UI와 content script는 직접 통신하지 않는다.

### Bounded CDP adapter

bounded CDP adapter는 일반 DOM executor가 trusted input을 만들 수 없는 승인된 R1/R2 도구에서만 service worker가 호출하는 내부 실행 계층이다. 모델, provider plugin, 페이지와 site adapter는 raw CDP method, selector, node ID, 좌표 또는 실행 경로를 지정할 수 없다.

adapter는 현재 run의 `(tab, frame, documentId, documentEpoch, ref_id)`에 결속된 target을 content script가 preflight한 뒤, 고정된 `DOM.*`과 `Input.*` command allowlist만 호출한다. `Runtime.evaluate`, `Network.*`, `Target.*`, `Page.captureScreenshot`과 임의 JavaScript는 제품 runtime에서 허용하지 않는다. attach는 action 실행 직전에 지연 수행하고 검증 직후 `finally`에서 detach한다.

### Provider registry와 plugin host

registry는 내장 plugin과 Settings에서 설치한 선언형 plugin manifest를 검증하고 provider 설정의 `plugin_id`를 해석한다. plugin host는 선택한 plugin에 정규화된 모델 요청을 전달하고 request plan과 provider event를 교환한다. 원격 executable code는 설치하거나 실행하지 않는다.

### Core HTTP transport

core transport는 최종 URL 검증, timeout/cancellation, API key header와 사용자가 입력한 정적 header 주입, HTTP/streaming 실행, 오류 redaction을 담당한다. plugin은 API key/header 값을 받거나 직접 network 요청을 수행하지 않는다. provider 설정은 사용자의 `chrome.storage.local`에만 존재한다.

## 3. 모델 연결

```text
Settings
  └─ chrome.storage.local.providers[providerId]
       ├─ plugin_id / plugin_version
       └─ Service worker provider registry
            └─ plugin host
                 └─ core HTTP transport
                      └─ HTTPS 또는 사용자가 지정한 local-network HTTP endpoint
                           └─ LLM
```

provider는 `plugin_id`, `plugin_version`, `base_url`, `wire_api`, `model`, `api_key`, `api_key_header`, `headers`, timeout과 enabled 상태를 가진다. 기존 설정은 내장 `contextpilot.openai-compatible` plugin으로 migration한다. `api_key_header`는 `authorization_bearer`, `api-key`, `x-goog-api-key` 중 하나다. plugin은 이 집합을 확장하거나 OAuth/token refresh를 구현할 수 없다. `headers`는 `{name, value}` 목록이며 같은 header 이름의 중복, 빈 이름, 제어 문자는 거부한다. `Content-Type: application/json`은 core가 고정한다.

## 4. 실행 흐름

### Ask

1. 사용자가 Side Panel에서 요청한다.
2. service worker가 현재 문서를 확인하고 content script에 projection을 요청한다.
3. 내부 `ref_id`를 run 한정 `model_ref`로 바꾼 snapshot과 읽기 도구 schema를 선택한 provider plugin을 통해 보낸다.
4. 모델 응답의 도구 호출은 schema와 현재 run mapping을 검증한 뒤 읽기 결과로 렌더링한다.

### Act

1. Ask와 같은 snapshot 생성 뒤 모델이 도구와 `model_ref`를 제안한다.
2. service worker가 capability × host 권한, target 상태, 민감 필드, 도구 schema를 검사한다.
3. 권한이 없으면 사용자는 이번 작업만 허용, 항상 허용, 거부 중 하나를 선택한다.
4. 제출·외부 전송·결제·삭제 같은 결과적 행동은 매 실행마다 별도 확인을 요구한다.
5. content script가 target을 다시 확인한다. 일반 DOM 경로로 신뢰성 있게 실행할 수 있으면 DOM executor를 사용하고, tool definition이 bounded CDP를 허용하며 trusted input이 필요한 경우에만 CDP adapter를 선택한다.
6. CDP 경로는 현재 target에 결속된 내부 hit-test token을 해석하고 allowlisted trusted input 한 건을 전송한다. dispatch가 시작된 뒤에는 DOM/CDP 경로를 바꾸거나 자동 재시도하지 않는다.
7. service worker가 navigation 또는 semantic 상태 변화를 확인하고 CDP를 detach한다. 효과가 불명확하면 `UNKNOWN`으로 끝낸다.

## 5. 상태와 수명

`IDLE → READING → PROPOSING → WAITING_PERMISSION? → PREFLIGHT → WAITING_CONFIRMATION? → EXECUTING → VERIFYING → COMPLETED | FAILED | UNKNOWN | CANCELLED`

- `model_ref`, raw form value, 권한의 이번 작업 허용은 현재 run 메모리에만 있다.
- 탭 이동, frame 교체, Stop, service worker 재시작은 진행 중 Act를 취소한다.
- CDP session은 action에만 유효하다. 완료·실패·불명·취소, navigation, tab close와 Stop은 detach를 요구하며 cleanup이 확인되지 않은 tab의 다음 Act를 차단한다.
- attach 전에 실패하면 `CDP_UNAVAILABLE` 또는 `CDP_CONFLICT`로 dispatch 없이 종료한다. dispatch 이후 연결이 끊기고 verifier가 결과를 확정하지 못하면 `UNKNOWN`이며 자동 재시도하지 않는다.
- `UNKNOWN`은 성공으로 처리하지 않으며 자동 재시도하지 않는다.
