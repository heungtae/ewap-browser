# 11. Sprint 진행 상태

기준일: 2026-08-22

| Sprint | 상태        | 완료 조건                                                             |
| ------ | ----------- | --------------------------------------------------------------------- |
| S0     | In Progress | build, package, 제품 인증 surface 부재, Windows/Linux Chrome smoke    |
| S1     | In Progress | projection·Ask E2E와 browser credential 비노출                        |
| S2     | In Progress | permission/R0-R3, credential 거부, bounded CDP와 detach-leak E2E      |
| S3     | In Progress | provider plugin, core-owned API key auth와 OAuth/token 거부           |
| S4     | In Progress | plugin Settings/secret lifecycle, local network, diagnostics contract |
| S5     | Planned     | Chat streaming/resync, tool timeline, modal, a11y와 실제 Chrome UI    |
| S6     | Planned     | hidden DOM 기본 read, find, vision, tabs와 read batch Chrome E2E      |
| S7     | Planned     | generic Act, bounded CDP 실제 연결, verifier와 일반 fixture E2E       |
| S8     | Planned     | standard/plan/skip permission mode와 hard-policy matrix               |
| S9     | Planned     | Windows/Linux package와 전체 인증·인가·upgrade·rollback 출시 증적     |

현재 구현 증적은 typecheck, ESLint, unit/fixture/E2E source test, extension build, package policy와 release smoke까지다. `S0~S4`의 실제 Chrome 동작은 아직 완료 증적이 아니며, S5~S9는 [채택 설계](17-claude-browser-capability-adoption-design.md)와 [검증계획](18-claude-browser-capability-verification-plan.md)만 작성된 상태다. 이 문서 변경은 구현, Chrome E2E 또는 Sprint 완료를 의미하지 않는다.
