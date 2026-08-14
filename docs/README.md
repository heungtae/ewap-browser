# Company Web Agent 문서 안내

이 저장소는 아직 구현 baseline을 포함하지 않는 **설계·계획 단계**다. 이 문서 집합은 구현을 시작하기 전에 AI-DLC 관점의 책임, 증적, 승인 게이트와 스프린트 순서를 고정한다.

## 기준 문서

| 문서 | 역할 | 상태 |
|---|---|---|
| [상세 설계](company-web-agent-detailed-design.md) | 제품·보안·기술 설계의 기준 | Baseline |
| [기존 구현 계획](coding-agent-implementation-plan.md) | upstream 기반의 초기 phase/PR 제안 | Baseline |
| [Company 아키텍처 경계](company-architecture.md) | trust boundary와 책임 분리의 요약 기준 | Active plan |
| [Company 보안 모델](company-security-model.md) | 위협, 금지 surface, fail-closed 통제와 증적 | Active plan |
| [구성 관리](configuration.md) | managed configuration의 소유권과 변경 통제 | Active plan |
| [운영 및 release](operations.md) | 배포, 장애 대응, monitoring, rollback의 준비 기준 | Active plan |
| [Upstream sync](upstream-sync.md) | upstream 변경의 검토·채택 절차 | Active plan |
| [스프린트 계획](sprints.md) | 구현 순서, 의존성, 진입/완료 조건 | Active plan |
| [Sprint별 상세 계획](sprints/README.md) | Sprint별 설계·작업·검증 계획서 | Active plan |
| [스프린트 상태](sprint-status.md) | 실제 완료 여부와 증적의 단일 기록부 | Active ledger |
| [AI-DLC 거버넌스](ai-dlc-governance.md) | AI 사용, 책임, 모델 평가, 운영 게이트 | Active plan |
| [요구사항 추적성](requirements-traceability.md) | 요구사항에서 설계·검증·스프린트까지의 연결 | Active plan |
| [검증 매트릭스](verification-matrix.md) | 테스트 수준별 필수 증적과 release gate | Active plan |
| [ADR 목록](adr/README.md) | 구현 전/중 결정의 승인 기록 | Active process |

## 문서 운영 규칙

1. 구현을 시작하기 전에는 `sprint-status.md`의 Sprint 0만 `In Progress`로 바꿀 수 있다.
2. 어떤 Sprint도 증적 링크, 책임 역할의 검토, 선행 Sprint 완료 없이 `Done`으로 바꾸지 않는다.
3. 요구사항·위협·모델 사용·도구·permission이 변경되면 추적성, 검증 매트릭스, 해당 ADR 및 상태 기록을 같은 변경에 갱신한다.
4. 이 문서들은 계획이며, baseline build/test 결과나 security approval을 이미 획득한 것으로 주장하지 않는다.
