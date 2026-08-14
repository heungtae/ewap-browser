# S3 — Verified Core Form Automation

## 1. 설계 계획

- **목표:** 제한된 UI tool surface로 textbox, textarea, checkbox, radio, native select, ARIA combobox와 portal popup을 AX/ref_id 기반으로 조작한다.
- **선행 조건:** S2 Done.
- **연계 요구사항:** RQ-01, RQ-07.
- **필요 ADR:** ADR-002, ADR-009; 새 tool이면 registry/risk 관련 ADR 영향도 검토.
- **불변 조건:** 각 mutation tool은 schema, COMPANY_TOOLS, mode, capability, risk, confirmation, verifier, audit redaction, unit, fixture, browser E2E를 같은 delivery에 가진다. CSS/XPath는 진단 가능한 fallback만 허용한다.
- **비범위:** drag/drop, iframe/shadow DOM expansion, arbitrary JavaScript, file transfer.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | shared ref freshness/target semantics와 verifier contract를 확정 | action and verifier interfaces | Extension + QA |
| 2 | field/textarea/checkbox/radio controlled-input behavior를 추가 | tool contracts and fixtures | Extension |
| 3 | select option discovery/selection을 추가 | native select contract | Extension |
| 4 | ARIA combobox/portal state machine을 추가 | combobox flow and fixtures | Extension + Accessibility reviewer |
| 5 | outcome을 VERIFIED/FAILED/UNKNOWN으로 표준화 | result schema and audit hooks | Extension + Security |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Unit | ref resolution, controlled setter, verifier result mapping | actual state와 expected state만 VERIFIED | unit report |
| Fixture | native form, React/Vue input, checkbox/radio, select, combobox, portal, modal | 각 UI pattern의 intended state가 확인됨 | fixture results |
| Browser E2E | full extension form scenario, SPA rerender, stale ref | browser state 확인 전 성공 선언 없음 | E2E report |
| Security | hidden/overlay target, UNKNOWN outcome | target mismatch deny; UNKNOWN no-retry | security test report |

## 4. 종료 조건과 기록

- [x] 허용된 각 tool의 10개 동반 변경 항목이 [completeness matrix](S3-tool-completeness.md)로 증명됐다.
- [x] fixture와 local browser contract가 verifier outcome을 assertion한다; managed-origin E2E는 RC1 GO 조건이다.
- [x] RQ-01/07과 상태 기록부를 갱신했다.
