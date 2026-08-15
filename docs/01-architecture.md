# 01. 시스템 아키텍처

## 1. 설계 원칙

1. 브라우저의 의미 정보는 Chrome MV3 content script가 DOM에서 만드는 제한된 **semantic projection**과 문서 범위의 `ref_id`로 표현한다. Chrome Accessibility Tree(AX tree)를 읽는다고 주장하지 않는다.
2. 모델 출력은 비신뢰 입력이다. 모델은 행동을 제안하고, 확장 내부의 순수 정책 엔진만 허가한다.
3. 모든 브라우저 변경은 실행 전 preflight와 실행 후 verifier를 통과해야 한다.
4. 변경 결과가 `UNKNOWN`이면 자동 재시도하지 않는다.
5. 단일 목적 구성요소와 명시적 인터페이스를 사용한다. 확장 모듈은 LLM·정책·DOM·네트워크 권한을 함께 갖지 않는다.
6. 로컬 PC에 있는 값도 비밀로 가정하지 않는다. AI Hub가 헤더와 Windows SSO assertion을 검증한다.

## 2. 논리 구성

```text
Side Panel ──┐
             ├── Extension service worker ── Policy / Audit / Run coordinator
Content script┘              │                         │
                             │                         └── Page Profile resolver ── Business MCP
                             │
                             └── Native Messaging ── Company Agent Host ── codex-chat-bridge ── AI Hub / Local LLM
                                                           │
                                                           └── Windows SSO broker (IWA/Kerberos)
```

### Side Panel

사용자가 Ask/Act 모드를 선택하고, 작업 요청·R2 확인 대기열·현재 origin·profile 상태·최소 감사 요약을 본다. 설정 편집 화면이나 개발자 모드는 제공하지 않는다.

### Content script

현재 문서의 DOM에서 semantic projection snapshot을 생성하고, 허가된 실행 명령만 수행한다. projection은 `role`, 정규화·redaction 된 accessible name, 제한된 상태(`disabled`, `checked`, `selected`, `expanded`), landmark/label 관계, visible/enabled 여부만 산출한다. shadow DOM은 열린 경계 안에서만, cross-origin frame은 독립 frame scope에서만 수집하며, closed shadow DOM·브라우저 AX 전용 속성·화면 좌표·raw HTML·input value는 수집하지 않는다. 페이지에서 온 이벤트·DOM 텍스트·window 메시지는 모두 비신뢰 입력이다. Content script는 네트워크, Native Messaging, Managed Storage에 직접 접근하지 않으며 service worker에 제한된 메시지만 보낸다.

### Service worker

작업의 유일한 조정자다. 모드, origin, Page Profile, 도구 노출, 위험 분류, 확인 토큰, 중복 방지, 감사 이벤트를 관리한다. allowlist에 없는 런타임 메시지는 거부한다.

### Policy engine

UI·모델·MCP와 독립된 순수 함수로 구현한다. 입력은 `ActionIntent`, context, profile이고 출력은 `ALLOW`, `REQUIRE_CONFIRMATION`, `DENY` 중 하나와 이유 코드다. 정책은 prompt가 아니라 서명된 확장 코드와 Managed policy로 시행한다.

### Company Agent Host

Windows Native Messaging host다. 허용된 확장 ID만 수락하고, Windows 통합 인증으로 짧은 수명의 사용자 assertion을 얻은 뒤 LLM 요청을 local bridge에 전달한다. 확장은 SSO 자격 증명·장기 토큰·AI Hub 비밀값을 읽지 못한다.

### codex-chat-bridge 및 AI Hub

bridge는 OpenAI-compatible wire 변환과 정해진 헤더 전달을 담당한다. AI Hub는 static header, 사용자 assertion, 요청 origin/클라이언트 식별을 검증하고, 권한·사용량·폐기·감사를 최종 집행한다.

## 3. 주된 실행 흐름

### Ask 요청

1. 사용자가 Side Panel에서 요청한다.
2. service worker가 페이지 읽기, Profile resolver, LLM egress 각각의 origin gate와 Ask 모드를 확인한다.
3. content script가 redacted semantic projection snapshot을 만든다.
4. service worker가 모델 없이 Page Profile을 결정적으로 resolve하고, current profile의 deterministic binding과 page-allowlisted `agentic-read` Business MCP tool만 tool snapshot에 합친다. 전체 JWS/profile body는 모델에 보내지 않는다.
5. service worker가 내부 `ref_id`를 run 한정 `model_ref`로 치환한 모델용 snapshot과 허용된 읽기 도구 스키마만 Agent Host에 전송한다. `ref_id`와 이 매핑은 Host와 모델에 전달하지 않는다.
6. Agent Host가 SSO assertion을 추가해 bridge로 보낸다.
7. 모델의 제안은 정책을 다시 통과한 뒤 읽기 결과로만 렌더링한다.

### Act 요청

1. Ask와 동일한 전처리 후, origin allowlist·Page Profile·도구 allowlist를 모두 확인한다.
2. 모델은 raw action value 없이 tool, run 한정 `model_ref` target, 허용된 boolean/key argument만 제안한다. service worker가 schema, mode, ref 존재성, 위험도, 중복, target label을 preflight한다.
3. `set_text_by_ref` 또는 `select_option_by_ref`이면 target을 먼저 확정한 뒤 Side Panel에 `AWAITING_VALUE`를 표시한다. 사용자가 입력한 값은 run/target/tool에 결속된 일회성 value slot으로 service worker와 content script에만 전달하며 모델·Host에는 보내지 않는다.
4. R2면 단 한 번 쓰는 확인 ID와 사람이 읽을 수 있는 변경 요약을 Side Panel에 표시한다.
5. value slot 또는 사용자 확인이 필요한 경우 이를 atomic consume한 뒤 content script가 정확히 하나의 행동을 실행한다.
6. verifier가 기대 상태를 확인해 `VERIFIED`, `FAILED`, `UNKNOWN`으로 정규화한다.
7. `UNKNOWN`은 중단·감사·사용자 알림만 하며 value를 복구하거나 재시도하지 않는다.

## 4. Page Profile과 MCP

Page Profile은 URL origin/path 규칙과 **값이 제거된** semantic projection fingerprint로 결정한다. profile은 resolver 응답의 서명을 검증한 뒤에만 수락하며, 다음만 선언할 수 있다.

- 허용 origin/path와 만료 시간
- 노출 가능한 기존 Company Tool 이름
- 이 page profile에서 허용된 Business MCP server/tool 확장과 authoritative field 목록
- field semantic label, risk override의 하향 제한, verifier 기대값

profile 변경·만료·탭 이동·SPA의 major semantic 변화 시 이전 profile의 도구는 즉시 철회하고 진행 중 action을 취소한 뒤 새 profile을 resolve한다. 알 수 없는 profile은 Act를 거부하고 Ask에는 기본 읽기 도구만 남긴다. authoritative MCP 호출이 실패하면 모델이 값을 추측하거나 DOM에서 대체 발견하지 못하게 한다. Profile 신뢰·갱신의 상세 계약은 03에, resolver·Business MCP API와 값 노출 경계는 13에 정의한다.

## 5. 상태 모델

`IDLE → READING → PROPOSING → PREFLIGHT → AWAITING_CONFIRMATION? → EXECUTING → VERIFYING → COMPLETED | FAILED | UNKNOWN | CANCELLED`

- document epoch는 content script가 document start에 단 한 번 생성·등록하고 service worker가 검증한 뒤 채택한다. 작업은 등록된 탭·frame·document epoch, profile ID, action sequence에 결속된다.
- 모델용 `model_ref → ref_id` 매핑은 service worker의 현재 run 메모리에만 존재하며 모델 proposal을 내부 target으로 단 한 번 해석한 뒤 terminal transition에서 폐기한다.
- navigation, frame 교체, profile 변경, Stop, service worker 재시작은 진행 중 작업을 취소한다.
- 확인 토큰은 Host가 검증한 opaque session binding, 탭, 문서 epoch, 정확한 intent digest에 결속하고 한 번만 쓴다. 확장은 Windows 사용자 이름·UPN·그룹을 받지 않는다.

## 6. 신규 코드베이스 경계

신규 저장소는 `extension/`, `native-host/`, `deployment/`, `contracts/`, `tests/`, `docs/`로 시작한다. 과거 프로젝트의 소스 파일을 복사하거나 import하지 않는다. 공유가 필요한 것은 OpenAI 호환 HTTP/streaming 표준 및 이 문서의 JSON 계약뿐이다.
