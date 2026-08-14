# 운영 및 Release 준비 계획

## 운영 상태

| 상태 | 사용자 경험 | 자동화 정책 |
|---|---|---|
| Healthy | ASK/ACT를 정책 안에서 제공 | normal policy enforcement |
| Model degraded | LLM 응답/연결 실패 안내 | browser action 시작 금지 |
| Policy/config invalid | 설정 오류 안내 | ACT fail closed |
| Page Profile unknown | 읽기 전용 안내 | ACT deny |
| CDP attach failure | 명시적 실패 안내 | synthetic click fallback 금지 |

## 필수 운영 산출물

S8 전에 다음을 실제 증적으로 준비한다.

- managed extension deployment 절차와 rollback 절차
- model/provider outage, extension failure, CDP conflict, security incident runbook
- audit access/retention/incident escalation owner
- monitoring signal: tool authorization denial, confirmation result, verifier outcome, UNKNOWN outcome, CDP attach/detach, model/MCP availability
- SBOM, OSS license 검토, approved permission/tool/provider snapshots

## Incident 원칙

1. 불확실성이나 policy failure에서는 Act를 정지하고 fail closed한다.
2. incident evidence에는 secret, raw page text, full typed value를 포함하지 않는다.
3. root cause, affected version/config/profile, containment, rollback, regression test를 기록한다.
4. security invariant를 변경하는 remediation은 ADR과 security review를 거친다.

## Current audit implementation boundary

S4 stores a bounded local `companyAuditEvents` timeline containing only redacted policy/action outcome metadata. It deliberately has no enterprise forwarding implementation until retention, access control and endpoint ownership are approved.
