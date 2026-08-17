# WebBrain 사용자 인증·인가 비교

## 문서 성격

| 항목      | 값                                                            |
| --------- | ------------------------------------------------------------- |
| 상태      | Informative, non-normative                                    |
| 작성일    | 2026-08-17                                                    |
| 목적      | WebBrain과 현재 설계의 사용자 인증·인가 차이를 읽기 쉽게 보존 |
| 사용 범위 | 배경 이해와 비교 검토                                         |
| 사용 금지 | 요구사항, 설계 결정, 구현, 테스트, Sprint, release 근거       |

이 문서는 개발 입력이 아니다. 여기에 기술된 WebBrain 기능을 backlog로 간주하거나 현재 제품에 도입해서는 안 된다. 도입 여부가 별도로 결정되더라도 이 문서가 아니라 번호가 붙은 규범 설계 문서에 새 계약을 작성하고 독립적으로 검토해야 한다.

## 비교 기준

- 우리 설계: 2026-08-17 현재 작업 트리의 `docs/01-architecture.md`, `docs/02-security-policy.md`, `docs/04-llm-provider-plugin.md`, `docs/06-data-audit-and-privacy.md`
- WebBrain: 로컬 `webbrain` 링크가 가리키는 upstream checkout의 commit `70271912921afa4c208a62b1408f99a0b9e7d7f1`
- 비교 대상: 사용자 인증, LLM provider 인증, 제품 계정, 웹사이트 세션, 행동 인가, credential 보관과 이동

우리 문서의 Sprint 상태는 모두 `Planned`다. 따라서 이 비교는 WebBrain의 구현과 우리 제품의 목표 설계 계약을 대조한 것이며 구현 성숙도를 비교한 것이 아니다.

## 요약

WebBrain은 브라우저 사용자의 기존 권한을 넓게 활용하는 개인용 자동화 제품이다. 우리 설계는 제품 계정과 OAuth를 두지 않고, 기존 사이트 세션을 이용하되 credential 처리와 고위험 행동을 더 강하게 제한하는 로컬 단일 사용자 에이전트다.

| 영역             | WebBrain                                                             | 우리 설계                                                            | 주된 차이                                          |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| 로컬 사용자      | Chrome profile 사용자를 사용자로 간주                                | Chrome profile 소유자를 유일한 사용자와 승인 주체로 간주             | 둘 다 별도 로컬 로그인이 없음                      |
| 웹사이트 인증    | 기존 Chrome 세션을 사용하고 사용자와 같은 권한으로 행동              | 기존 Chrome 세션을 사용하지만 password, OTP, token 입력을 금지       | 우리는 로그인과 재인증 자동화가 제한됨             |
| 제품 계정        | WebBrain Cloud 이메일 인증, sync token, subscription 상태가 존재     | 제품 계정, SSO, Cloud Sync가 없음                                    | 우리 쪽의 계정 공격면과 중앙 관리 기능이 모두 작음 |
| LLM 인증         | API key와 Claude, OpenAI, Gemini 등의 OAuth/PKCE 지원                | 제한된 API key header와 정적 header만 지원                           | 우리는 단순하고 OAuth token lifecycle이 없음       |
| 행동 인가        | capability와 host별 once, always, deny                               | 같은 기본 모델에 R0-R3 위험 등급과 고위험 확인을 추가                | 우리 설계가 고위험 행동을 더 강하게 제한           |
| 인가 우회        | 설정으로 permission gate 전체 우회 가능                              | R2/R3 확인은 일반 편의 설정으로 제거할 수 없음                       | WebBrain은 편의성, 우리는 fail-closed를 우선       |
| 조직 인가        | 브라우저 행동에 조직 RBAC가 없음                                     | RBAC, service account, 중앙 정책이 없음                              | 둘 다 enterprise IAM 모델이 아님                   |
| 비밀 저장과 이동 | local storage에 token/key 저장, 설정 export와 암호화 Cloud Sync 지원 | local storage에 key를 저장하지만 export, sync, audit, 모델 전달 금지 | 저장 강도는 유사하나 우리 쪽 유출 경로가 좁음      |

## 인증 계층

### 웹사이트 세션

두 제품 모두 웹사이트가 Chrome에 발급한 cookie와 session을 재사용한다. 사이트는 에이전트를 별도 service account가 아니라 로그인한 브라우저 사용자로 본다.

WebBrain은 로그인된 사이트에서 사람이 할 수 있는 작업을 에이전트도 수행할 수 있다는 ambient-authority 모델을 사용한다. credential 필드를 판별하고 값 노출을 줄이는 기능은 있지만 password와 token 입력 자체는 지원하며, 가장 강한 비밀 비노출은 선택형 strict mode다.

우리 설계는 사이트의 세션 권한과 에이전트의 행동 승인을 별개 경계로 취급한다. password, OTP, recovery code와 token 필드를 읽거나 자동 입력하지 않는다. 로그인과 MFA는 사용자가 브라우저에서 직접 완료해야 한다.

### 제품 계정

WebBrain Cloud Sync는 이메일 challenge를 시작하고 상태를 polling한 뒤 Bearer sync token을 저장한다. subscription 오류를 별도 상태로 처리하며 revoke 경로도 제공한다. 동기화 vault는 PBKDF2-HMAC-SHA-256으로 키를 유도하고 AES-256-GCM으로 암호화한다.

우리 설계에는 제품 계정, 중앙 session, subscription authorization과 Cloud Sync가 없다. 이로 인해 계정 탈취와 중앙 token 관리 공격면은 줄지만 사용자 철회, 기기 관리, 조직 감사와 라이선스 제어도 제공할 수 없다.

### LLM provider 인증

WebBrain은 일반 API key 외에 PKCE OAuth와 access/refresh token 갱신을 지원한다. 일부 provider 흐름은 WebBrain에 독립 등록된 client가 아니라 vendor CLI의 client ID를 재사용하므로 약관과 provider-side 철회 위험이 있다.

우리 설계는 다음 방식만 허용한다.

- 인증 없음
- `Authorization: Bearer <key>`
- `api-key: <key>`
- `x-goog-api-key: <key>`
- 사용자가 직접 입력한 검증된 정적 header

Plugin은 token endpoint, OAuth scope, refresh token과 새로운 인증 scheme을 추가할 수 없다. Plugin에는 credential이 전달되지 않으며 core transport가 request plan 검증 후 인증 header를 마지막에 주입한다.

## 행동 인가

두 제품 모두 읽기와 상태 변경을 구분하고, 상태 변경 도구를 capability와 target host에 매핑한다. 한 번 허용과 영구 허용도 구분한다.

WebBrain은 사용자가 `askBeforeConsequentialActions`를 끄면 permission gate 전체를 우회할 수 있다. 확장 자체도 `<all_urls>`, debugger, scripting, webRequest, downloads 등 넓은 browser authority를 가진다. 우리 설계도 trusted input을 위해 `debugger`를 채택했지만 사내 host, action-scoped lifecycle과 closed `DOM.*`/`Input.*` allowlist로 제한하고 R2/R3 확인 우회를 허용하지 않는다. WebBrain은 기능 범위가 넓은 만큼 extension이나 모델 경계가 침해될 때의 영향 반경도 크다.

우리 설계는 행동을 다음과 같이 분류한다.

- R0: 읽기와 요약
- R1: 일반 입력, 선택과 click
- R2: 제출, 생성, 전송과 외부 상태 변경
- R3: 결제, 계약, 계정·보안 설정과 삭제

R2는 현재 intent와 session에 결합된 별도 confirmation을 요구한다. R3는 기본 거부하며 명시 작업과 전용 확인 UI가 모두 있는 제한된 도구만 예외적으로 실행한다. Provider 또는 plugin capability는 browser 행동 권한을 추가하지 못한다.

## Credential 경계

양쪽 모두 `chrome.storage.local`을 OS-backed secret store로 볼 수 없다.

WebBrain은 OAuth access/refresh token과 provider key를 저장한다. 설정 export에는 평문 provider API key가 포함될 수 있으며 Cloud Sync 대상 provider 설정은 client-side encrypted vault로 이동할 수 있다.

우리 설계도 provider API key와 정적 header를 local storage에 저장하지만 다음 경로로는 보내지 않는다.

- prompt와 tool schema
- plugin host와 page script
- audit와 diagnostics
- export와 sync
- browser credential, password, OTP와 raw action value

따라서 at-rest 저장 강도는 본질적으로 비슷하지만 복제와 유출 경로는 우리 설계가 더 제한적이다.

## 해석

보안 경계 관점에서 우리 설계는 다음을 우선한다.

- 제품 계정, OAuth와 refresh token 공격면 제거
- password와 OTP가 agent 실행 경로에 들어오지 않도록 차단
- provider plugin과 인증정보 분리
- 고위험 행동 confirmation의 우회 방지
- secret export와 Cloud Sync 제외

WebBrain은 다음 제품 기능을 우선한다.

- 로그인과 재인증을 포함한 넓은 브라우저 자동화
- subscription 기반 LLM 연결
- 다중 기기 설정 동기화
- 광범위한 사이트와 browser tool 지원
- 실제 구현된 capability와 host permission gate

이 차이는 우열이나 향후 개발 방향을 뜻하지 않는다. 두 제품이 선택한 trust boundary와 기능 범위가 다르다는 배경 정보로만 읽는다.

## 참고한 로컬 근거

우리 설계:

- `docs/01-architecture.md`
- `docs/02-security-policy.md`
- `docs/04-llm-provider-plugin.md`
- `docs/06-data-audit-and-privacy.md`
- `docs/11-sprint-progress.md`

WebBrain checkout:

- `src/chrome/src/agent/tools.js`
- `src/chrome/src/agent/permission-gate.js`
- `src/chrome/src/agent/agent.js`
- `src/chrome/src/agent/credential-fields.js`
- `src/chrome/src/providers/oauth-claude.js`
- `src/chrome/src/providers/oauth-subscriptions.js`
- `src/chrome/src/profile-sync.js`
- `src/chrome/src/config-transfer.js`
- `src/chrome/manifest.json`
