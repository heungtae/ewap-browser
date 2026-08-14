# S4 — Audit & Evidence Pipeline

## 1. 설계 계획

- **목표:** action lifecycle과 policy/verifier outcome을 상관 가능한 최소 audit event로 남기고, sensitive data를 제거한다.
- **선행 조건:** S3 Done.
- **연계 요구사항:** RQ-08.
- **필요 ADR:** ADR-010.
- **불변 조건:** password, OTP/MFA, token, cookie, Authorization header, full typed value, raw page text는 어떤 audit sink에도 기록하지 않는다. audit은 mutation success의 유일한 증명이 아니며 verifier evidence와 연결된다.
- **비범위:** 중앙 SIEM의 구체 제품 선택, business data warehouse, user surveillance analytics.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | event taxonomy, correlation ID, required/forbidden field를 정의 | audit schema and data dictionary | Security + Privacy |
| 2 | action/policy/confirmation/verifier lifecycle emission을 설계 | event emission contract | Extension |
| 3 | redaction and safe failure serialization을 설계 | redaction rules/test corpus | Security + QA |
| 4 | retention, access, local/enterprise forwarding boundary를 정한다 | retention/access decision | Privacy + Operations |
| 5 | Sprint/PR evidence와 audit event의 연결 형식을 정한다 | evidence index format | QA + Release |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Unit | redactor, schema validation, forbidden field detection | sensitive sample이 직렬화되지 않음 | negative unit report |
| Integration | policy→tool→verifier lifecycle | correlation ID로 결과를 추적 가능 | event sample/schema report |
| E2E | R2 approve/deny, failed/UNKNOWN mutation, Stop | 각 outcome이 최소 event로 남음 | audit E2E evidence |
| Privacy/Security | log export and failure path | raw page/typed secret leakage=0 | reviewer sign-off |

## 4. 종료 조건과 기록

- [ ] audit schema와 retention/access decision이 승인됐다.
- [ ] secret/redaction negative tests와 mutation-to-audit coverage가 있다.
- [ ] ADR-010, RQ-08, 상태 기록부를 갱신했다.
