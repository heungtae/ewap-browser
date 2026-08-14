# 구성 관리 계획

## 소유권

구성은 managed Chrome policy 또는 build-time deployment configuration이 authoritative source다. 사용자가 provider URL, model, allowlist, tool surface, audit endpoint를 임의 변경하는 UI는 제공하지 않는다.

| 구성 영역 | 예 | 소유 역할 | 변경 통제 |
|---|---|---|---|
| LLM provider | base URL, model ID, timeout, tool protocol | AI platform owner | ADR/release review |
| origin allowlist | internal origins/path constraints | Security + application owner | security approval |
| COMPANY_TOOLS | allowed UI/control tools | Security + Extension owner | tool snapshot/review |
| Page Profile/MCP registry | server allowlist, profile version, bindings | AI/MCP + business owner | schema/role/audit review |
| audit | endpoint, retention, access policy | Security/Privacy/Operations | privacy/security approval |

## Validation rules

- schema validation failure는 default-open이 아니라 capability disable/fail closed다.
- local preference는 managed security configuration을 override할 수 없다.
- secret은 storage, audit, UI diagnostics, test report에 기록하지 않는다.
- configuration change에는 version, owner, effective date, rollback value를 남긴다.

S1에서 actual schema와 precedence test를 만들고, S7에서 Page Profile/MCP configuration을 이 규칙에 편입한다.
