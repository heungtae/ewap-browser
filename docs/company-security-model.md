# 보안 모델과 위협 대응 계획

## 보호 대상

- 로그인된 enterprise browser session 및 업무 state
- password, OTP/MFA, API token, cookie, Authorization header, typed field value
- company model/MCP endpoint, managed configuration, audit data
- tool exposure, Chrome permission, Page Profile metadata의 integrity

## 위협과 필수 통제

| 위협 | 피해 | 결정적 통제 | 검증 Sprint |
|---|---|---|---|
| prompt injection/page instruction | 승인되지 않은 action 또는 data leak | page data untrusted, COMPANY_TOOLS, policy outside LLM | S1,S2,S6 |
| external origin mutation | enterprise session misuse | ACT origin allowlist, navigation recheck | S1,S6 |
| dangerous/general-purpose tool | arbitrary code/network/file action | prohibited tool surface 제거, tool snapshot review | S1,S6 |
| R2/R3 bypass | business loss | R2 blocking confirmation, R3 hard deny | S2,S6 |
| stale ref/overlay/iframe | wrong-target mutation | semantic target validation, verifier, hostile fixture | S3,S6 |
| timeout/ambiguous outcome | duplicate business mutation | duplicate guard, UNKNOWN no-retry | S2,S3,S6 |
| secret/log leakage | credential or business data exposure | data minimization/redaction, negative tests | S4,S6 |
| Page Profile compromise/outage | over-exposed MCP tools or unsafe fallback | authenticated/schema-validated profile, dynamic revoke, unknown fail closed | S7 |
| model regression | unsafe or invalid proposal | versioned evaluation and release thresholds | S8 |

The detailed Company threat-to-test mapping and residual disposition are maintained in [company-threat-model.md](company-threat-model.md) and [S6 risk register](sprints/S6-risk-register.md).

## Non-negotiable fail-closed conditions

- allowlist 밖 origin의 ACT
- unknown Page Profile의 ACT
- R3 action
- required confirmation 미획득
- verifier `UNKNOWN`인 mutation의 automatic retry
- authoritative Business MCP 값 조회 실패 후의 model guess
- malformed tool request, disabled tool direct call, configuration/schema validation failure

## Security review evidence

security reviewer는 release 전 permission/host permission, provider egress, model-exposed tools, R2/R3 enforcement, redaction, profile tool isolation, security regression 결과를 검토한다. 자세한 증적 형식은 [검증 매트릭스](verification-matrix.md), 실제 완료 선언은 [상태 기록부](sprint-status.md)를 따른다.
