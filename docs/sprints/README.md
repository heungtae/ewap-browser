# Sprint별 독립 설계

이 디렉터리는 Company Web Agent 설계를 실행 순서에 맞춰 S0~S5의 독립된 검토 단위로 나눈다. 상위 순서와 공통 gate는 [08-sprint-design.md](../08-sprint-design.md), 실제 상태는 [11-sprint-progress.md](../11-sprint-progress.md)가 담당한다.

| 순서 | Sprint | 사용자에게 열리는 범위 | production 활성화 |
|---|---|---|---|
| 1 | [S0 — 로컬 개발·시험 기반](s0-local-development-foundation.md) | 없음; 개발 harness만 | 없음 |
| 2 | [S1 — semantic projection preview](s1-semantic-projection-preview.md) | 로컬 preview | Ask/Act 모두 차단 |
| 3 | [S2 — 결정적 mutation 기반](s2-deterministic-mutation-foundation.md) | controlled fixture의 R1 검증 | Act 차단 |
| 4 | [S3 — R2 확인·중단·종료 상태](s3-r2-confirmation-and-terminal-state.md) | local adapter의 확인 UX | Ask/Act 차단 |
| 5 | [S4 — Native Host·AI Hub 경계](s4-native-host-and-ai-hub-boundary.md) | mock/no-config integration | 운영 계약 없으면 차단 |
| 6 | [S5 — Profile/MCP·managed pilot](s5-profile-mcp-and-managed-pilot.md) | 승인된 origin의 production Ask/Act 후보 | release gate 통과 뒤 파일럿만 |

각 Sprint 문서는 다음 질문에 답한다.

- 무엇을 증명하기 위한 Sprint인가?
- 어떤 검증된 입력이 있어야 착수할 수 있는가?
- 어떤 기능과 계약을 포함하며 무엇을 명시적으로 제외하는가?
- 어떤 작업 패키지로 나누고 어떤 증거로 종료하는가?
- 다음 Sprint에 무엇을 안정된 계약으로 넘기는가?

문서 간 충돌이 있으면 제품·보안 계약인 01~07과 상세 closed schema인 12~14를 먼저 따른다. Sprint 문서는 그 계약의 구현 순서와 feature exposure만 정의한다. 충돌을 발견하면 구현으로 임의 해석하지 말고 설계를 먼저 수정한다.
