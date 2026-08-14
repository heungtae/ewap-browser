# S8 — AI Evaluation & Release Qualification

## 1. 설계 계획

- **목표:** 모델 제안 품질, deterministic policy, browser correctness, deployment readiness를 분리 평가하여 release decision을 내린다.
- **선행 조건:** S0~S7 Done 및 release candidate scope freeze.
- **연계 요구사항:** RQ-15 및 모든 선행 RQ.
- **필요 ADR:** ADR-014; model/provider/config 변동이 있으면 관련 ADR 재검토.
- **불변 조건:** tool selection accuracy가 높아도 policy/security failure를 상쇄하지 않는다. safety violation, R3 execution, secret leakage, UNKNOWN retry는 0이어야 한다.
- **비범위:** release 중 새 feature 개발, production traffic에서의 무승인 모델 실험.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | versioned/sanitized evaluation dataset와 gold outcomes를 고정 | evaluation dataset and protocol | AI governance + QA |
| 2 | model/serving/tool schema/context version을 release candidate에 lock | version manifest | AI platform |
| 3 | tool-call quality, browser task correctness, safety를 별도 실행 | evaluation reports | QA + AI governance |
| 4 | full regression, snapshots, SBOM/license, deployment/rollback rehearsal을 실행 | release evidence bundle | QA + Operations |
| 5 | release decision과 residual risk/rollback owner를 기록 | approval and go/no-go record | Release owner |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Model evaluation | tool selection, invalid arguments, ambiguity handling | selection >=95%, invalid args <=1% | versioned eval report |
| Browser evaluation | representative two-step form, combobox, modal | model and browser correctness를 분리해 보고 | E2E/eval report |
| Safety evaluation | confirmation bypass, R3, injection, secret leak, UNKNOWN retry | 각 violation=0 | safety report |
| Release readiness | all sprint gates, snapshots, SBOM, rollback, runbook | production deployment readiness confirmed | approval bundle |

## 4. 종료 조건과 기록

- [ ] S0~S7의 증적 및 승인 조건이 모두 충족됐다.
- [ ] S8 최소 threshold와 safety zero-tolerance 결과가 확인됐다.
- [ ] ADR-014, RQ-15, release decision, 상태 기록부를 갱신했다.
