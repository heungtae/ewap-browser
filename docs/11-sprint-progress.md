# 11. Sprint 진행 현황

## 사용 방법

이 문서는 실제 진행 상태의 단일 기준이다. 상태는 `Planned`, `In progress`, `Blocked`, `Completed`만 사용한다. `Completed`에는 반드시 검증 명령 결과와 Git commit hash가 있어야 한다. 설계·계획 문서를 작성한 것만으로 개발 Sprint가 완료되지는 않는다.

Sprint를 시작할 때 owner, 시작일, 범위, branch를 채운다. 종료할 때 실제 명령, 결과, test count, 예외/보류, commit hash를 채운다. 실패한 검증은 삭제하지 않고 `Blocked` 사유에 남긴다.

## 현재 상태

기준일: 2026-08-15. 이 문서는 개발 계획만 수립한 상태이며, 아래 구현 Sprint를 시작하거나 컴파일·Chrome 설치 검증을 실행하지 않았다.

| Sprint | 상태 | 독립 설계 | 선행 | 검증 증적 | Commit | 다음 조치 |
|---|---|---|---|---|---|---|
| S0 | Planned | [로컬 개발·시험 기반](sprints/s0-local-development-foundation.md) | - | 미실행 | - | S0 범위만 구현·검증 |
| S1 | Planned | [semantic projection preview](sprints/s1-semantic-projection-preview.md) | S0 | 미실행 | - | S0 완료 후 시작 |
| S2 | Planned | [결정적 mutation 기반](sprints/s2-deterministic-mutation-foundation.md) | S1 | 미실행 | - | S1 완료 후 시작 |
| S3 | Planned | [R2 확인·중단·종료 상태](sprints/s3-r2-confirmation-and-terminal-state.md) | S2 | 미실행 | - | S2 완료 후 시작 |
| S4 | Planned | [Native Host·AI Hub 경계](sprints/s4-native-host-and-ai-hub-boundary.md) | S3, 운영 계약 | 미실행 | - | S3 완료 및 운영 입력 확인 후 시작 |
| S5 | Planned | [Profile/MCP·managed pilot](sprints/s5-profile-mcp-and-managed-pilot.md) | S4, 승인 | 미실행 | - | S4 완료 및 승인 준비 후 시작 |

## Sprint 종료 기록 템플릿

각 Sprint 행의 `Completed` 전환 시 아래 블록을 추가한다.

```md
### S<N> 종료 기록

- 범위:
- branch / owner / 기간:
- 실행 명령:
- 결과 및 test count:
- 수동 Chrome/VM 확인:
- 보류 또는 알려진 제한:
- 문서 갱신: 08 / 09 / 10 / 11 중 해당 항목
- Git commit: `<hash> <subject>`
```

## 변경 통제 점검표

- [ ] 현재 Sprint의 설계·계획·검증 섹션을 확인했다.
- [ ] 이전 Sprint가 `Completed`이며 commit hash와 검증 증적이 있다.
- [ ] 새 permission/tool/message/운영 입력의 영향이 문서화됐다.
- [ ] 필수 로컬 검증과 `git diff --check`를 수행했다.
- [ ] 이 Sprint만 포함한 staged diff를 확인했다.
- [ ] commit hash와 다음 Sprint 상태를 이 문서에 반영했다.
