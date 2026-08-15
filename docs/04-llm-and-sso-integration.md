# 04. Local LLM, 고정 헤더 및 Windows SSO 연동

## 1. 결정

사용자는 별도 로그인 화면을 거치지 않는다. Windows에 로그인한 회사 사용자가 SSO의 주체가 된다. 다만 Chrome 확장이 Windows 사용자 이름을 읽어 헤더에 넣는 방식은 신뢰할 수 없으므로 사용하지 않는다. 대신 Windows 프로세스인 Company Agent Host가 통합 Windows 인증을 사용해 SSO broker에서 짧은 수명의 assertion을 얻는다.

모델 연결은 `codex-chat-bridge`와 같은 OpenAI-compatible bridge의 구성 개념을 따른다.

- bridge URL과 wire (`chat`, `responses` 중 채택한 하나)
- AI Hub가 요구하는 정적 header 목록
- upstream model override
- streaming/cancellation/error normalization

값은 AI Hub가 관리하며 사용자는 수정할 수 없다.

## 2. 요청 경로

```text
Extension service worker
  └─ Native Messaging (허용 확장 ID, typed request)
      └─ Company Agent Host
          ├─ Windows IWA / Kerberos -> SSO broker -> short-lived user assertion
          └─ HTTP loopback -> codex-chat-bridge -> AI Hub / local LLM
```

Agent Host는 요청을 bridge에 보낼 때 다음을 수행한다.

1. 배포 설정에서 허용된 bridge endpoint와 고정 header 목록을 선택한다.
2. 현재 Windows logon session으로 SSO broker에 인증한다.
3. 사용자 assertion을 매 요청 또는 짧은 TTL cache에서 얻는다.
4. 고정 header는 이름·값을 변환하거나 UI 값과 병합하지 않고 설정 순서대로 전송한다.
5. 사용자 assertion은 별도의 승인된 header(예: `X-Company-User-Assertion`)에 추가한다.
6. bridge timeout, cancellation, response size를 제한하고 정규화한 결과만 확장에 돌려준다.

bridge는 AI Hub 설정에 따라 고정 upstream headers를 붙이고, 허용 목록에 있는 incoming assertion header만 upstream으로 forward한다. AI Hub는 정적 client header와 assertion의 issuer/audience/expiry/tenant를 모두 검증한다.

## 3. 헤더 보안 규칙

- 배포 설정의 header는 사용자 변경 불가지만, 로컬 사용자·개발자 도구·메모리에서 노출될 수 있다. 따라서 장기 API key, password, Bearer token, cookie를 확장 Managed Storage에 두지 않는다.
- AI Hub의 정적 header는 client/deployment/tenant 식별과 제한 정책 용도여야 하며 단독 인증 수단이 아니어야 한다.
- 사용자 assertion은 SSO broker가 서명하고 짧은 TTL, audience=AI Hub, nonce/발급시각을 가져야 한다.
- Agent Host와 bridge의 설정 파일은 관리자 ACL로 보호하고 로그에 header 값·prompt·response body를 남기지 않는다.
- 허용하지 않은 request header는 bridge로 전달하지 않는다. `Authorization`, cookie, proxy credential 등은 기본 거부다.
- TLS를 사용하고 AI Hub certificate validation을 끄지 않는다. loopback bridge도 localhost 외 bind를 금지한다.

## 4. Native Messaging host

Windows 설치 패키지는 host executable과 host manifest를 설치하고 해당 Chrome extension ID만 `allowed_origins`에 둔다. host manifest 등록은 조직 표준에 따라 HKLM으로 수행하고, per-user HKCU 등록은 사내 보안 검토 전에는 금지한다.

Host IPC request에는 action/tool schema, redacted snapshot, request ID, cancellation만 허용한다. host는 DOM, browser tab, arbitrary URL, shell command를 받지 않는다. 표준 출력은 Native Messaging framing 데이터만 쓰고 운영 로그는 redacted event ID만 stderr/Windows Event Log로 낸다.

## 5. SSO broker 계약

AI Hub가 Windows Integrated Authentication을 직접 지원하면 Host는 AI Hub token endpoint를 broker로 사용할 수 있다. 그렇지 않으면 회사 IdP 앞에 다음 최소 broker를 둔다.

`POST /company-agent/assertions`

입력은 Windows IWA로 인증된 TLS 세션과 `deployment_id`, `client_nonce`, `extension_version`만 포함한다. 출력은 signed user assertion과 만료시각이다. 이름, UPN, 그룹 목록을 확장에 반환하지 않는다. AI Hub는 assertion subject/권한을 해석한다.

### 필수 운영 확정 항목

구현 전 AI Hub 운영팀은 다음을 제공해야 한다.

1. bridge의 정확한 inbound URL/wire/streaming 지원 여부
2. upstream URL, 모델 ID, 고정 header의 **이름·값 소유자·회수 절차**
3. assertion header 이름, issuer, audience, TTL, clock skew, revoke 동작
4. IWA 방식(Kerberos/Negotiate)과 broker endpoint/certificate
5. 요청·동시성·토큰 사용량 제한과 오류 코드 계약

이 값이 없는 환경에서는 LLM 호출을 시작하지 않고 UI에 `AI_HUB_NOT_CONFIGURED`를 표시한다.

## 6. 실패 정책

- SSO assertion 발급 실패·만료·audience 불일치: 새 LLM 요청 거부
- AI Hub 401/403: assertion을 한 번 폐기하고 사용자의 명시적 새 요청에서만 다시 발급
- transport timeout/stream 오류: run을 `FAILED`로 종료, browser mutation은 시작하지 않음
- mutation 실행 중 모델 연결이 끊김: 이미 검증된 단일 action 결과만 마무리하고 후속 action은 취소

자동 재시도는 상태 변경 작업에 적용하지 않는다.
