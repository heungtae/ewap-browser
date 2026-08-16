# 01. 시스템 아키텍처

## 1. 제품 모델

WebBrain은 사용자가 Chrome에 설치해 현재 브라우저 세션과 선택한 LLM 제공자를 연결하는 MV3 브라우저 에이전트다. 사용자는 Settings에서 모델 연결과 실행 권한을 직접 관리한다.

## 2. 논리 구성

```text
Side Panel ─────────────┐
Content script ─────────┼── Service worker ── Provider client ── Local OpenAI-compatible LLM
                         │          │
                         │          ├── chrome.storage.local
                         │          │    provider settings / API key / headers / user permissions
                         │          └── current Chrome tab and its logged-in session
                         └── Settings
```

### Side Panel

사용자는 Ask 또는 Act 작업을 시작하고, 모델 제공자, 사이트별 권한, 확인 요청과 실행 결과를 본다. 비밀값은 Settings의 password input에서만 편집하며 Side Panel의 대화·감사 화면에 표시하지 않는다.

### Content script

현재 문서에서 semantic projection과 문서 범위 `ref_id`를 만들고, service worker가 허용한 단일 DOM 작업만 실행한다. 페이지 DOM, 이벤트, `postMessage`와 모든 페이지 텍스트는 비신뢰 입력이다.

### Service worker

작업 상태, 모델 요청, capability × host 권한 검사, 사용자 확인, `model_ref → ref_id` 매핑, 실행 전 preflight와 실행 후 상태 검증을 담당한다. UI와 content script는 직접 통신하지 않는다.

### Provider client

선택한 provider 설정으로 OpenAI 호환 `/chat/completions` 또는 `/responses` 요청을 만든다. API key header와 사용자가 입력한 정적 header를 요청에 넣는다. provider 설정은 사용자의 `chrome.storage.local`에만 존재한다.

## 3. 모델 연결

```text
Settings
  └─ chrome.storage.local.providers[providerId]
       └─ Service worker provider client
            └─ HTTPS 또는 사용자가 지정한 local-network HTTP endpoint
                 └─ OpenAI-compatible LLM
```

provider는 `base_url`, `wire_api`, `model`, `api_key`, `api_key_header`, `headers`, timeout과 enabled 상태를 가진다. `api_key_header`는 `authorization_bearer`, `api-key`, `x-goog-api-key` 중 하나다. `headers`는 `{name, value}` 목록이며 같은 header 이름의 중복, 빈 이름, 제어 문자는 거부한다. `Content-Type: application/json`은 client가 고정한다.

## 4. 실행 흐름

### Ask

1. 사용자가 Side Panel에서 요청한다.
2. service worker가 현재 문서를 확인하고 content script에 projection을 요청한다.
3. 내부 `ref_id`를 run 한정 `model_ref`로 바꾼 snapshot과 읽기 도구 schema를 provider client로 보낸다.
4. 모델 응답의 도구 호출은 schema와 현재 run mapping을 검증한 뒤 읽기 결과로 렌더링한다.

### Act

1. Ask와 같은 snapshot 생성 뒤 모델이 도구와 `model_ref`를 제안한다.
2. service worker가 capability × host 권한, target 상태, 민감 필드, 도구 schema를 검사한다.
3. 권한이 없으면 사용자는 이번 작업만 허용, 항상 허용, 거부 중 하나를 선택한다.
4. 제출·외부 전송·결제·삭제 같은 결과적 행동은 매 실행마다 별도 확인을 요구한다.
5. content script가 단일 행동을 실행하고 service worker가 navigation 또는 semantic 상태 변화를 확인한다.

## 5. 상태와 수명

`IDLE → READING → PROPOSING → WAITING_PERMISSION? → PREFLIGHT → WAITING_CONFIRMATION? → EXECUTING → VERIFYING → COMPLETED | FAILED | UNKNOWN | CANCELLED`

- `model_ref`, raw form value, 권한의 이번 작업 허용은 현재 run 메모리에만 있다.
- 탭 이동, frame 교체, Stop, service worker 재시작은 진행 중 Act를 취소한다.
- `UNKNOWN`은 성공으로 처리하지 않으며 자동 재시도하지 않는다.
