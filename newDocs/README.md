# Company Web Agent — 신규 설계서

## 목적

이 문서는 **새로운 Chrome 전용 Company Web Agent를 처음부터 구현하기 위한 기준 설계**다. 기존 WebBrain 저장소의 코드, 모듈, 문서, 테스트, 패키지 구조 또는 배포물을 구현 입력으로 사용하지 않는다. 과거 구현은 호환성 대상도 아니며, 신규 저장소는 이 문서의 계약과 테스트만을 기준으로 만든다.

## 제품 경계

- 대상 브라우저: Windows의 Google Chrome, Manifest V3만 지원한다.
- 사용자: 회사 Windows 계정으로 로그인한 직원.
- 설치: 사내 포털에서 사용자가 시작하는 설치. 회사 관리 Chrome 정책으로 확장과 설정을 배포한다.
- 모델: 사내 AI Hub가 제공하는 Local LLM. 확장은 `codex-chat-bridge` 호환 OpenAI wire adapter를 통해서만 모델에 연결한다.
- 설정: AI Hub 운영자가 배포 정책과 로컬 브리지 설정으로 제공한다. 사용자는 값을 열람할 수 있어도 변경할 수 없다.
- 브라우저 작업: Accessibility Tree의 안정적 `ref_id`를 주 대상으로 사용한다. LLM은 제안만 하고, 결정적 정책 코드가 허가·실행·검증한다.

## 범위

1. Ask(읽기 전용) 및 Act(승인된 변경) 모드
2. AX tree 수집, 페이지 요약, 요소 탐색 및 `ref_id` 기반 작업
3. 입력·선택·체크·클릭·키 입력의 결정적 정책, 확인, 검증
4. 회사 origin allowlist, R0~R3 위험 분류, R2 사용자 확인, R3 거부
5. Page Profile 및 Business MCP의 결정적 연결
6. Windows SSO 주체를 AI Hub 호출에 결속하는 Native Messaging host
7. 최소·비식별 감사 기록, 운영 상태, 중지 및 오류 처리
8. 사내 포털 설치, 자체 업데이트, Managed Storage 기반의 잠긴 구성

## 명시적 비범위

- Firefox, Edge, Safari 및 모바일 브라우저
- 임의 JavaScript 실행, 임의 네트워크 조사/검색, 업로드, 다운로드
- 스케줄러, 클라우드 동기화, OAuth 구독 제공자, CAPTCHA 자동화, WebMCP, 소셜 미디어 자동화
- 사용자 설정으로 LLM endpoint, 모델, 헤더, origin 또는 권한을 변경하는 기능
- 페이지 원문, 입력값, 비밀번호, OTP/MFA, 쿠키, 토큰, Authorization 헤더의 저장 또는 감사 로그 기록

## 문서 지도

| 문서 | 구현자가 답해야 하는 질문 |
|---|---|
| [01-architecture.md](01-architecture.md) | 무엇을 어떤 신뢰 경계로 구성하는가? |
| [02-security-policy.md](02-security-policy.md) | 어떤 행동을 어떤 조건에서 허가·거부하는가? |
| [03-extension-design.md](03-extension-design.md) | MV3 확장은 어떤 모듈·권한·메시지를 가지는가? |
| [04-llm-and-sso-integration.md](04-llm-and-sso-integration.md) | Local LLM, 고정 헤더, Windows SSO는 어떻게 연결되는가? |
| [05-deployment-operations.md](05-deployment-operations.md) | 포털 설치와 잠긴 설정·업데이트는 어떻게 운영하는가? |
| [06-data-audit-and-privacy.md](06-data-audit-and-privacy.md) | 무엇을 보관하고 무엇을 절대 보관하지 않는가? |
| [07-verification-and-release.md](07-verification-and-release.md) | 출시 전에 무엇을 자동·수동으로 증명해야 하는가? |

## 우선 구현 순서

1. Manifest/Managed Storage/Native Host 설치 기반과 최소 Side Panel
2. AX tree + `ref_id` 읽기 경로와 Ask 모드
3. 정책 엔진, origin allowlist, 위험 분류, 감사 이벤트
4. 검증 가능한 폼 변경 도구와 R2 확인 UX
5. AI Hub/SSO/bridge 연결 및 Page Profile/MCP
6. 배포 자동화, 보안 회귀, 사내 파일럿

각 단계는 다음 단계의 기능을 미리 노출하지 않는다.
