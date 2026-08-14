# AI-DLC 거버넌스 및 필수 산출물

## 목적과 적용 범위

Company Web Agent는 브라우저에서 현재 로그인된 사내 업무 시스템을 다루므로, 일반 기능 개발 절차에 AI 모델·도구·페이지 데이터·업무 mutation의 거버넌스를 추가한다. 이 문서는 코드 구현이 아닌, 구현과 release 전에 충족해야 하는 AI-DLC 산출물과 책임을 정한다.

## 생명주기 게이트

| 단계 | 핵심 질문 | 필수 산출물 | 종료 책임 |
|---|---|---|---|
| Discover | 어떤 업무 문제를 자동화하며 무엇을 자동화하지 않는가? | 목표/비목표, stakeholder, success metric, risk tier | Product owner |
| Design | 누가 어떤 경계를 강제하고 data/model/tool은 어떻게 흐르는가? | 상세 설계, trust boundary, threat model, ADR | Architecture + Security |
| Build | 모델이 제안한 action을 어떤 코드가 제한하는가? | tool registry, policy/risk/confirmation/verifier, traceability update | Extension lead |
| Verify | 모델 품질과 browser mutation correctness가 분리돼 검증됐는가? | fixture/E2E/security/eval reports, snapshots | QA + AI governance |
| Release | 배포·rollback·monitoring과 법적/보안 조건이 준비됐는가? | SBOM, license, runbook, release approval | Release + Operations |
| Operate | drift, incident, profile/model/config 변경을 통제하는가? | audit, incident record, periodic evaluation, change log | Operations + Security |

## AI 책임 경계

| 주체 | 허용 책임 | 금지 책임 |
|---|---|---|
| Qwen/vLLM | untrusted page context에서 action 후보·설명 생성, page-allowed read-only business tool 선택 | authorization, origin allowlist, risk 판정, confirmation 우회, authoritative value 추측 |
| Deterministic policy layer | mode/origin/capability/risk/confirmation/duplicate 검증 및 tool exposure | 모델의 자연어 의도를 security decision으로 해석해 승인 |
| Verifier | 실제 AX/DOM/browser state로 mutation 결과 판단 | model response만으로 성공 선언 |
| Human user | R2 business mutation의 명시적 승인, Stop 수행 | R3 destructive action 승인 |
| Page Profile MCP | page identity 및 허용 business tool metadata 제공 | enterprise policy 또는 user authority 우회 |

## AI-DLC 필수 통제

### Data and privacy

- 모델·MCP·감사에 보내는 데이터 분류와 최소화 규칙을 release 전에 검토한다.
- password, OTP/MFA, API token, cookie, Authorization header, full typed value, raw page text는 저장·감사·평가 dataset에서 제외한다.
- Accessibility Fingerprint는 semantic role/name/path만 사용하고 값, ref_id, 좌표, CSS/XPath, dynamic identifier를 제거한다.
- evaluation fixture도 synthetic data 또는 승인된 비밀 제거 데이터를 사용한다.

### Model and evaluation

- model ID, serving image/version, endpoint, tool schema version, prompt/context template version을 evaluation report에 고정한다.
- tool selection quality와 browser action correctness를 별도 지표로 수집한다.
- safety 평가에는 prompt injection, malformed tool call, confirmation bypass, secret exfiltration, unknown mutation retry가 포함된다.
- model 또는 tool schema가 바뀌면 S8 release qualification을 재수행한다.

### Human oversight and accountability

- R2는 Side Panel에서 action summary를 보여 주는 blocking confirmation이 필요하다.
- R3는 confirmation이 아니라 deterministic deny다.
- user, Security, Product, Operations, AI governance owner의 승인 기록은 `sprint-status.md`의 증적으로 연결한다.

### Change and incident control

- provider endpoint/model, Chrome permission, COMPANY_TOOLS, Page Profile schema, business MCP allowlist 변경은 ADR 검토 대상이다.
- security incident는 Act를 fail closed로 전환할 수 있어야 하며, incident record에는 비밀이나 raw page text를 포함하지 않는다.
- upstream security patch는 무조건 merge하지 않고 security review 및 regression evidence 후 채택한다.

## 산출물 상태와 생성 시점

| 산출물 | 기준 또는 생성 Sprint | 현재 상태 |
|---|---|---|
| 상세 설계·비목표 | existing detailed design | Available |
| Sprint plan/status | S0 시작 전 | Available |
| 요구사항 추적성 | S0 시작 전, 이후 매 Sprint | Updated through S8 |
| threat model 및 risk register | S0~S1 | Available; live deployment review pending |
| baseline/inventory | S0 | Complete |
| ADR 결정문 | S0부터 필요 시 | ADR-001 through ADR-014 recorded |
| tool/permission/config snapshots | S0 baseline, S1 이후 변경마다 | Local snapshots verified |
| test/evaluation evidence | S1부터, S8 release gate | Local contract and regression evidence complete; live model eval pending |
| SBOM/license/deployment/runbook | S0 계획, S8 검증 | SBOM generated; deployment rehearsal/owner approvals pending |

## 최소 risk acceptance 규칙

high/critical security finding, R3 execution 가능성, secret leakage, allowlist 밖 ACT, UNKNOWN mutation auto-retry는 risk acceptance만으로 release할 수 없다. 수정·비활성화·fail-closed 중 하나가 확인될 때까지 Sprint는 `Done`이 될 수 없다.
