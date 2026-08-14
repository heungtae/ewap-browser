# S6 — Security & Resilience Hardening

## 1. 설계 계획

- **목표:** hostile page, malformed input, lifecycle error, dependency outage에서 모든 action path가 fail closed인지 검증하고 잔여 위험을 결정한다.
- **선행 조건:** S5 Done.
- **연계 요구사항:** RQ-10, RQ-11.
- **필요 ADR:** risk acceptance가 필요할 경우 관련 ADR; new/changed invariant면 ADR 추가.
- **불변 조건:** high/critical finding, secret leak, unapproved mutation, CDP detach leak은 acceptance로 release하지 않는다. synthetic click 또는 model retry로 불확실성을 숨기지 않는다.
- **비범위:** new business feature, threat model에서 승인되지 않은 capability expansion.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | threat model을 attack path와 test case로 구체화 | prioritized security test catalog | Security |
| 2 | prompt injection/hidden overlay/iframe/navigation fixtures를 만든다 | hostile fixture suite | QA + Security |
| 3 | stale ref, malformed call, duplicate, timeout/CDP conflict recovery를 강화 | resilience behavior contracts | Extension |
| 4 | performance/memory/debugger lifecycle metrics를 정의 | non-functional evidence plan | QA + Operations |
| 5 | finding triage, remediation, residual-risk expiry process를 운영 | risk register/review record | Security + Release |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Security regression | injection, overlay, malicious iframe, external navigation | unauthorized action/data egress=0 | security suite report |
| Resilience E2E | stale ref, duplicate submit, malformed call, model/MCP timeout, CDP conflict | deterministic failure; no hidden fallback/retry | browser E2E |
| Lifecycle | Stop, extension reload, navigation | debugger attach leak=0 | lifecycle logs |
| NFR | latency, memory, fixture stability | target/variance and known limits recorded | measurement report |

## 4. 종료 조건과 기록

- [ ] security regression suite가 release 후보에서 실행됐다.
- [ ] high/critical finding=0이며 residual risk는 owner/expiry/ADR로 기록됐다.
- [ ] RQ-10/11, threat model, 상태 기록부를 갱신했다.
