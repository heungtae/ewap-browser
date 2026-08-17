# 11. Sprint 진행 상태

기준일: 2026-08-17

| Sprint | 상태        | 완료 조건                                                             |
| ------ | ----------- | --------------------------------------------------------------------- |
| S0     | In Progress | build, package, 제품 인증 surface 부재, Windows/Linux Chrome smoke    |
| S1     | In Progress | projection·Ask E2E와 browser credential 비노출                        |
| S2     | In Progress | permission/R0-R3, credential 거부, bounded CDP와 detach-leak E2E      |
| S3     | In Progress | provider plugin, core-owned API key auth와 OAuth/token 거부           |
| S4     | In Progress | plugin Settings/secret lifecycle, local network, diagnostics contract |
| S5     | Planned     | Windows/Linux package와 사용자·provider 인증/행동 인가 출시 증적      |

현재 구현 증적은 typecheck, ESLint, unit/fixture/E2E source test, extension build, package policy와 release smoke까지다. `S0~S4`의 실제 Chrome 동작과 S5의 Windows/Linux clean-profile·update·rollback 증적은 Chrome for Testing 전용 실행 파일과 각 OS 환경에서 추가해야 하므로 아직 완료로 표시하지 않는다.
