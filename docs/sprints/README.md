# Sprint별 설계·개발·검증 계획서

이 폴더의 문서는 [상위 스프린트 로드맵](../sprints.md)을 실행 가능한 작업 단위로 분해한다. 각 문서는 반드시 다음 세 부분을 가진다.

1. **설계 계획** — 경계, 결정, 금지 사항, 연계 요구사항/ADR
2. **개발 계획** — 순서, 산출물, 역할, 명시적 비범위
3. **검증 계획** — 테스트 레벨, 필수 케이스, 증적, 종료 판정

## 문서와 상태의 관계

| 문서 | 역할 |
|---|---|
| 이 폴더의 Sprint 계획서 | 무엇을 어떤 설계로 만들고 검증할지 정의 |
| [`../sprints.md`](../sprints.md) | Sprint 순서, 의존성, 공통 종료 게이트 |
| [`../sprint-status.md`](../sprint-status.md) | 실제 시작/완료/차단과 증적 링크의 단일 기록부 |
| [`../requirements-traceability.md`](../requirements-traceability.md) | 요구사항과 Sprint/검증 연결 |
| [`../verification-matrix.md`](../verification-matrix.md) | 공통 테스트·release gate |
| [`../adr/README.md`](../adr/README.md) | 설계 결정을 승인 가능한 ADR로 관리 |

## Sprint 계획서

| 순서 | 문서 | 선행 조건 |
|---|---|---|
| S0 | [Baseline & Delivery Foundation](S0-baseline-foundation.md) | 없음 |
| S1 | [Enterprise Lockdown](S1-enterprise-lockdown.md) | S0 Done |
| S2 | [Policy & Mutation Control Plane](S2-policy-control-plane.md) | S1 Done |
| S3 | [Verified Core Form Automation](S3-verified-form-automation.md) | S2 Done |
| S4 | [Audit & Evidence Pipeline](S4-audit-evidence.md) | S3 Done |
| S5 | [Side Panel Operational UX](S5-operational-ux.md) | S4 Done |
| S6 | [Security & Resilience Hardening](S6-security-hardening.md) | S5 Done |
| S7 | [Page Profile MCP Control Plane](S7-page-profile-mcp.md) | S1,S2,S3,S4,S6 Done |
| S8 | [AI Evaluation & Release Qualification](S8-release-qualification.md) | S0~S7 Done |

새 Sprint는 [template](template.md)를 복사하고, `sprint-status.md`와 추적성 표에 함께 등록한다.
