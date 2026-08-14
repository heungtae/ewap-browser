# S2 — Policy & Mutation Control Plane

## 1. 설계 계획

- **목표:** mutation 전에 실행되는 capability/risk/confirmation/duplicate authorization path를 하나로 고정한다.
- **선행 조건:** S1 Done.
- **연계 요구사항:** RQ-02, RQ-06, RQ-07.
- **필요 ADR:** ADR-006/007/008/009.
- **불변 조건:** R2는 blocking confirmation 없이는 실행하지 않고, R3는 어떤 user/model input에도 hard deny다. `UNKNOWN` outcome을 action retry 근거로 사용하지 않는다.
- **비범위:** 개별 form control의 구현, audit storage, profile-specific business tool.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | tool capability와 R0~R3 classification model을 정의 | policy schema/matrix | Security + Product |
| 2 | tool registry에서 mode, origin, capability, risk를 결합 | single authorization entry point | Extension |
| 3 | R2 confirmation request/approve/deny contract를 설계 | confirmation state contract | Product + UX + Extension |
| 4 | mutation identity와 deduplication window를 정의 | duplicate guard contract | Extension + Business owner |
| 5 | deny/confirm/unknown 결과를 caller에 정규화 | failure semantics | Extension + QA |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Unit | R0~R3 classification, mode/origin/capability combinations | policy table의 모든 outcome이 deterministic | policy test report |
| Integration | direct invocation, malformed arguments, stale confirmation | registry 밖·승인 없는 mutation이 실행되지 않음 | integration report |
| UX/E2E | R2 approve/deny 및 duplicate same action | user intent가 명확히 표시되고 중복 실행 차단 | browser E2E |
| Security | prompt injection/R3 attempt/UNKNOWN retry | bypass=0, R3 execution=0, automatic retry=0 | negative regression report |

## 4. 종료 조건과 기록

- [ ] 모든 mutation path가 단일 policy entry point를 거친다.
- [ ] R2/R3/duplicate/UNKNOWN behavior가 테스트로 증명됐다.
- [ ] ADR-006~009, RQ-02/06/07, 상태 기록부를 갱신했다.
