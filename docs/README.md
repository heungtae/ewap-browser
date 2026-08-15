# Company Web Agent — 신규 설계서

## 목적

이 문서는 **새로운 Chrome 전용 Company Web Agent를 처음부터 구현하기 위한 기준 설계**다. 기존 WebBrain 저장소의 코드, 모듈, 문서, 테스트, 패키지 구조 또는 배포물을 구현 입력으로 사용하지 않는다. 과거 구현은 호환성 대상도 아니며, 신규 저장소는 이 문서의 계약과 테스트만을 기준으로 만든다.

## 제품 경계

- 대상 브라우저: Windows의 Google Chrome, Manifest V3만 지원한다.
- 사용자: 회사 Windows 계정으로 로그인한 직원.
- 설치: 사내 포털에서 사용자가 시작하는 설치. 회사 관리 Chrome 정책으로 확장과 설정을 배포한다.
- 모델: 사내 AI Hub가 제공하는 Local LLM. 확장은 `codex-chat-bridge` 호환 OpenAI wire adapter를 통해서만 모델에 연결한다.
- 설정: AI Hub 운영자가 배포 정책과 로컬 브리지 설정으로 제공한다. 사용자는 값을 열람할 수 있어도 변경할 수 없다.
- 브라우저 작업: Chrome MV3 content script가 DOM에서 생성한 제한된 semantic projection의 문서 범위 `ref_id`를 주 대상으로 사용한다. LLM은 run 한정 `model_ref`만 받고 제안하며, service worker의 결정적 정책 코드가 내부 target을 해석·허가·실행·검증한다.

## 범위

1. Ask(읽기 전용) 및 Act(승인된 변경) 모드
2. DOM semantic projection 수집, 페이지 요약, 요소 탐색 및 `ref_id` 기반 작업
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
| [04-llm-and-sso-integration.md](04-llm-and-sso-integration.md) | Local LLM, 고정 헤더, Windows SSO와 Host↔bridge 인증은 어떻게 연결되는가? |
| [05-deployment-operations.md](05-deployment-operations.md) | 포털 설치와 잠긴 설정·업데이트는 어떻게 운영하는가? |
| [06-data-audit-and-privacy.md](06-data-audit-and-privacy.md) | 무엇을 보관하고 무엇을 절대 보관하지 않는가? |
| [07-verification-and-release.md](07-verification-and-release.md) | 출시 전에 무엇을 자동·수동으로 증명해야 하는가? |
| [08-sprint-design.md](08-sprint-design.md) | 작은 구현 Sprint가 설계 경계를 어떻게 나누는가? |
| [09-sprint-development-plan.md](09-sprint-development-plan.md) | 각 Sprint에서 무엇을 구현하고 어떤 스크립트를 제공하는가? |
| [10-sprint-verification-plan.md](10-sprint-verification-plan.md) | 각 Sprint를 끝내기 위해 어떤 로컬 검증을 수행하는가? |
| [11-sprint-progress.md](11-sprint-progress.md) | Sprint별 실제 진행 상태와 검증·커밋 증거는 무엇인가? |
| [12-low-cost-agent-implementation-spec.md](12-low-cost-agent-implementation-spec.md) | 저가형 AI도 구현할 수 있게 파일·계약·알고리즘·작업 카드를 어떻게 고정하는가? |
| [13-page-profile-and-business-mcp-contract.md](13-page-profile-and-business-mcp-contract.md) | Profile resolver와 authoritative Business MCP를 어떤 서명·API·데이터 경계로 연결하는가? |
| [14-semantic-projection-fingerprint.md](14-semantic-projection-fingerprint.md) | Page Profile fingerprint의 canonical schema·정규화·hash·golden vector를 어떻게 고정하는가? |

## 우선 구현 순서

1. Manifest/Managed Storage/Native Host 설치 기반과 최소 Side Panel
2. DOM semantic projection + `ref_id` preview와 document epoch 등록
3. 정책 엔진, origin allowlist, 위험 분류, 감사 이벤트
4. 검증 가능한 폼 변경 도구와 R2 확인 UX
5. AI Hub/SSO/bridge 연결, Page Profile/MCP와 production Ask 활성화
6. 배포 자동화, 보안 회귀, 사내 파일럿

각 단계는 다음 단계의 기능을 미리 노출하지 않는다.

개발은 [08-sprint-design.md](08-sprint-design.md)부터 [12-low-cost-agent-implementation-spec.md](12-low-cost-agent-implementation-spec.md)까지의 Sprint 문서를 함께 기준으로 진행한다. 특히 구현 담당자가 저가형 AI이거나 신규 참여자이면 12의 작업 카드 하나만 수행한다. Sprint는 작게 끝내고, 각 Sprint의 검증 게이트가 통과한 뒤에만 하나의 독립된 Git commit으로 닫는다.
