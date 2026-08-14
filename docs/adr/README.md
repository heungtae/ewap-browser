# Architecture Decision Records

## ADR 운영 규칙

ADR은 현재 설계를 재진술하는 문서가 아니라, 대안·결정·영향·승인을 남기는 변경 통제 기록이다. 아래 항목은 상세 설계에서 요구되지만 아직 개별 승인 기록은 없다. 구현 전에 해당 Sprint의 책임자가 개별 ADR을 만들고 `Proposed → Accepted/Rejected/Superseded` 상태를 갱신한다.

각 ADR은 `Context`, `Decision`, `Alternatives`, `Consequences`, `Security/Privacy impact`, `Verification`, `Approvers`, `Status/Date`를 포함한다.

| ADR | 결정 주제 | 필요 Sprint | 현재 상태 |
|---|---|---|---|
| ADR-001 | WebBrain fork 선택 | S0 | Accepted |
| ADR-002 | AX tree/ref_id를 primary semantic interface로 선택 | S0 | Accepted |
| ADR-003 | Qwen3.5/vLLM 단일 runtime provider | S1 | Accepted |
| ADR-004 | enterprise domain allowlist | S1 | Accepted |
| ADR-005 | ASK/ACT two-mode model | S1 | Accepted |
| ADR-006 | deterministic policy outside LLM | S2 | Proposed |
| ADR-007 | R2 mutation human confirmation | S2 | Proposed |
| ADR-008 | R3 destructive action hard deny | S2 | Proposed |
| ADR-009 | mutation verifier와 UNKNOWN no-retry | S3 | Proposed |
| ADR-010 | minimal audit/redaction/retention | S4 | Proposed |
| ADR-011 | external automation/network feature disablement | S1 | Accepted |
| ADR-012 | upstream structure and security patch sync | S0 | Accepted |
| ADR-013 | Page Profile MCP deterministic control plane | S7 | Proposed |
| ADR-014 | model evaluation/release threshold | S8 | Proposed |

## ADR이 필요한 변경

- 금지된 tool, network surface, permission, provider, data-retention 정책을 추가·완화하는 변경
- risk 분류, confirmation, verifier, UNKNOWN retry 정책 변경
- Page Profile/Business MCP authority 또는 profile-publish 권한 변경
- release quality threshold, model/serving architecture, upstream merge policy 변경
