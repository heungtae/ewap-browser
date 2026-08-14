# Sprint 상태 기록부

> 단일 기준: 이 파일만 실제 Sprint 완료 여부를 선언한다. 현재는 구현을 시작하지 않았으므로 모든 Sprint가 `Planned`다.

## 상태 정의

| 상태 | 의미 |
|---|---|
| Planned | 범위와 종료 조건은 합의됐으나 작업 미시작 |
| In Progress | 담당자가 정해지고 실제 작업 및 증적 수집 중 |
| Blocked | 외부 결정/선행 조건/심각한 실패 때문에 진행 불가 |
| Done | 범위·필수 증적·승인 역할 검토가 모두 완료 |
| Superseded | ADR로 범위가 대체되었으며 대체 Sprint를 참조 |

## 현재 상태

| Sprint | 상세 계획 | 상태 | 선행 Sprint | 시작일 | 완료일 | 증적 | 승인 | blocker / 다음 조치 |
|---|---|---|---|---|---|---|---|---|
| S0 Baseline & Delivery Foundation | [계획](sprints/S0-baseline-foundation.md) | Done | - | 2026-08-14 | 2026-08-14 | [baseline](../BASELINE.md), [runtime](runtime-inventory.md), [tools](tool-inventory.md), [permissions](permission-inventory.md), [providers](provider-inventory.md) | Codex implementation/QA review | S1 시작 가능 |
| S1 Enterprise Lockdown | [계획](sprints/S1-enterprise-lockdown.md) | Done | S0 | 2026-08-14 | 2026-08-14 | `npm run test:company`, `npm run test:fixtures`, manifest load, ADR-003/004/005/011 | Codex implementation/QA review | S2 시작 가능 |
| S2 Policy & Mutation Control Plane | [계획](sprints/S2-policy-control-plane.md) | Done | S1 | 2026-08-14 | 2026-08-14 | `npm run test:company`, policy module/agent import, ADR-006/007/008 | Codex implementation/QA review | S3 시작 가능 |
| S3 Verified Core Form Automation | [계획](sprints/S3-verified-form-automation.md) | Planned | S2 | - | - | - | - | S2 완료 대기 |
| S4 Audit & Evidence Pipeline | [계획](sprints/S4-audit-evidence.md) | Planned | S3 | - | - | - | - | S3 완료 대기 |
| S5 Side Panel Operational UX | [계획](sprints/S5-operational-ux.md) | Planned | S4 | - | - | - | - | S4 완료 대기 |
| S6 Security & Resilience Hardening | [계획](sprints/S6-security-hardening.md) | Planned | S5 | - | - | - | - | S5 완료 대기 |
| S7 Page Profile MCP Control Plane | [계획](sprints/S7-page-profile-mcp.md) | Planned | S1,S2,S3,S4,S6 | - | - | - | - | 선행 Sprint 완료 대기 |
| S8 AI Evaluation & Release Qualification | [계획](sprints/S8-release-qualification.md) | Planned | S0~S7 | - | - | - | - | release candidate scope freeze 대기 |

## Sprint 종료 기록 양식

각 Sprint가 `Done` 또는 `Blocked`가 될 때 이 파일 아래에 항목을 추가한다. 링크는 commit, PR, CI run, test report, snapshot, ADR 또는 운영 검토 기록을 사용한다.

```markdown
### SNN — <name> — <status date>

- Status: Done | Blocked
- Scope delivered: <Sprint 계획과 대비한 실제 범위>
- Evidence:
  - Build/lint/unit: <link or not applicable with reason>
  - Browser E2E/security/evaluation: <link or not applicable with reason>
  - Snapshot/ADR/documentation: <link>
- Reviewers: <required approval roles and names/records>
- Residual risk or blocker: <none or explicit description>
- Next action: <next Sprint start condition or unblock action>
```

### S0 — Baseline & Delivery Foundation — 2026-08-14

- Status: Done
- Scope delivered: pinned upstream import, reproducible Node/browser fixture baseline, runtime/tool/permission/provider inventories, provenance and S0 ADRs.
- Evidence:
  - Build/lint/unit: [`BASELINE.md`](../BASELINE.md)
  - Browser E2E/security/evaluation: `npm run test:fixtures` and `npm run ci:e2e:dry` recorded in [`BASELINE.md`](../BASELINE.md)
  - Snapshot/ADR/documentation: [ADR-001](adr/ADR-001-webbrain-fork.md), [ADR-002](adr/ADR-002-accessibility-ref-id-interface.md), [ADR-012](adr/ADR-012-upstream-sync.md)
- Reviewers: Codex implementation/QA review; enterprise deployment approval is a later S8 release gate.
- Residual risk or blocker: broad upstream capability surface; S1 must reduce it before any company mutation tool is admitted.
- Next action: S1 Enterprise Lockdown.

### S1 — Enterprise Lockdown — 2026-08-14

- Status: Done
- Scope delivered: minimum MV3 manifest surface, managed company-vLLM provider, COMPANY_TOOLS allowlist, Ask/Act-only exposure and direct execution deny.
- Evidence:
  - Build/lint/unit: `npm run test:company`
  - Browser E2E/security/evaluation: `npm run test:fixtures`; Chromium manifest load command
  - Snapshot/ADR/documentation: [ADR-003](adr/ADR-003-managed-company-vllm.md), [ADR-004](adr/ADR-004-enterprise-origin-allowlist.md), [ADR-005](adr/ADR-005-ask-act-two-mode.md), [ADR-011](adr/ADR-011-disable-external-automation.md)
- Reviewers: Codex implementation/QA review; enterprise deployment approval is a later S8 release gate.
- Residual risk or blocker: mutation tools remain deliberately disabled until S2/S3 policy and verifier work.
- Next action: S2 Policy & Mutation Control Plane.

### S2 — Policy & Mutation Control Plane — 2026-08-14

- Status: Done
- Scope delivered: deterministic R0~R3 policy, confirmation ID approval path, R3 deny and redacted duplicate-mutation reservation.
- Evidence:
  - Build/lint/unit: `npm run test:company` including `mutation-policy.test.mjs`
  - Browser E2E/security/evaluation: direct policy denies unapproved R2, R3 and duplicate mutation before dispatch
  - Snapshot/ADR/documentation: [ADR-006](adr/ADR-006-deterministic-policy.md), [ADR-007](adr/ADR-007-r2-confirmation.md), [ADR-008](adr/ADR-008-r3-hard-deny.md)
- Reviewers: Codex implementation/QA review.
- Residual risk or blocker: S3 must add target-label preflight and verified form controls before mutation tools are enabled.
- Next action: S3 Verified Core Form Automation.

## 완료 판정 체크

- [ ] 선행 Sprint가 `Done`이다.
- [ ] `docs/sprints.md`의 범위와 완료 증적을 충족했다.
- [ ] 요구사항 추적성 및 검증 매트릭스가 변경 사항을 반영한다.
- [ ] 필요한 ADR/위협 모델/운영 문서가 갱신됐다.
- [ ] 지정된 승인 역할이 검토했다.
- [ ] 미해결 blocker 또는 high/critical security finding이 없다.
