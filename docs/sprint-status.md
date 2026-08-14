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

| Sprint | 상태 | 선행 Sprint | 시작일 | 완료일 | 증적 | 승인 | blocker / 다음 조치 |
|---|---|---|---|---|---|---|---|
| S0 Baseline & Delivery Foundation | Planned | - | - | - | - | - | upstream source 확보 후 baseline inventory 시작 |
| S1 Enterprise Lockdown | Planned | S0 | - | - | - | - | S0 완료 대기 |
| S2 Policy & Mutation Control Plane | Planned | S1 | - | - | - | - | S1 완료 대기 |
| S3 Verified Core Form Automation | Planned | S2 | - | - | - | - | S2 완료 대기 |
| S4 Audit & Evidence Pipeline | Planned | S3 | - | - | - | - | S3 완료 대기 |
| S5 Side Panel Operational UX | Planned | S4 | - | - | - | - | S4 완료 대기 |
| S6 Security & Resilience Hardening | Planned | S5 | - | - | - | - | S5 완료 대기 |
| S7 Page Profile MCP Control Plane | Planned | S1,S2,S3,S4,S6 | - | - | - | - | 선행 Sprint 완료 대기 |
| S8 AI Evaluation & Release Qualification | Planned | S0~S7 | - | - | - | - | release candidate scope freeze 대기 |

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

## 완료 판정 체크

- [ ] 선행 Sprint가 `Done`이다.
- [ ] `docs/sprints.md`의 범위와 완료 증적을 충족했다.
- [ ] 요구사항 추적성 및 검증 매트릭스가 변경 사항을 반영한다.
- [ ] 필요한 ADR/위협 모델/운영 문서가 갱신됐다.
- [ ] 지정된 승인 역할이 검토했다.
- [ ] 미해결 blocker 또는 high/critical security finding이 없다.
