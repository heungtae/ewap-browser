# S0 — Baseline & Delivery Foundation

## 1. 설계 계획

- **목표:** WebBrain upstream 기준점과 company fork의 차이를 재현 가능하게 기록한다. 이 Sprint는 기능 구현이 아니라 이후 보안 판단의 증거 기반을 만드는 단계다.
- **선행 조건:** 없음.
- **연계 요구사항:** RQ-01, RQ-09, RQ-15.
- **필요 ADR:** ADR-001 (fork), ADR-002 (AX/ref_id), ADR-012 (upstream sync).
- **불변 조건:** baseline 결과와 upstream defect를 수정하지 않는다. 코드 경로의 존재 여부를 추측하지 않고 실제 pinned commit에서 inventory로 확인한다.
- **비범위:** feature, permission/provider 변경, dependency update, security fix 적용.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | upstream commit을 얻고 provenance/license를 확인 | `BASELINE.md`의 source/pin/환경 기록 | Extension lead |
| 2 | build, lint, unit, extension load 절차를 실행·기록 | 재현 명령과 실제 결과/실패 로그 | QA lead |
| 3 | provider, tool, permission, cloud/scheduler/download 등 runtime import를 inventory | runtime/tool/provider/permission inventory | Extension + Security |
| 4 | baseline tool/manifest snapshot과 change-control 기준을 승인 | snapshot artifact와 ADR 검토 | Security lead |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Reproducibility | clean checkout에서 문서의 명령을 재실행 | 환경과 결과가 기록되고 실패는 숨기지 않음 | CI/run log |
| Inventory review | manifest, provider, tool, network surface 대조 | 추정이 아닌 파일/기호/경로로 inventory 작성 | reviewer checklist |
| Security review | 금지 feature code path와 최소 권한의 baseline 식별 | 이후 S1 diff의 비교 기준 확보 | approved snapshot |

## 4. 종료 조건과 기록

- [x] `BASELINE.md`와 네 종류 inventory가 실제 결과로 채워졌다.
- [x] baseline 명령, upstream pin, 알려진 실패가 증적으로 링크됐다.
- [x] ADR-001/002/012 검토 상태를 갱신했다.
- [x] S0 상태와 reviewer를 `../sprint-status.md`에 기록했다.
