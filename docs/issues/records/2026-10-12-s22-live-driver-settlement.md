# ISS-20261012-003 — S22 live driver의 최종 응답 전 조기 판정

- 발생/수정: 2026-10-12.
- 상태: 해결 — 검증 driver의 Browser-local 적용 범위.
- 제품 revision: `c0ae91f725074fd6671a8036325929d97817e033`, 확장 `0.1.106`.

## 발생과 원인

S22 Lightning 무료 모델의 variant 1 normal에서 `Structured goal confirmation missing`이
발생했다. 최초 JSON에는 판정 이후 도착한 `report_goal_status:completed`도 남아 있다.
`chrome-s21-smoke.mjs`는 Panel이 idle이고 Provider 기록이 2개 이상이면 structured goal
도착 전에도 종료했다. `calls`의 기록은 fetch 완료 전 추가되므로 실행 중인 proxy 호출도
종료 조건에서 누락됐다. 제품의 목표 판단 실패와 검증기의 조기 판정을 구분해야 한다.

## 수정

proxy 기록의 `answer_hash` 또는 오류가 확정될 때까지 대기한다. blocked 이외의
시나리오는 structured goal이 도착해야 종료한다. 기존 120초 live deadline과 HTTP 오류
판정은 유지한다. 승인 자동화·제품 runtime·확장 버전은 변경하지 않았다.

## 수용 조건과 검증

- 동일 variant 1 normal live 재실행: 1/1 PASS, HTTP 200 4회.
- 실제 변경 1회, 승인 카드 0, structured goal과 Worker 수용·최종 UI 확인.
- 같은 driver의 통제 Chrome 전체 9/9 PASS: 성공/UNKNOWN/차단 경계 회귀 포함.
- syntax/Prettier/Node globals 명시 ESLint PASS.

[최초 실패와 재실행 증거](../../evidence/s22-live-free-2026-10-12.md)를 따른다.
추가 live 3건은 HTTP 429로 재검증하지 못했으며, 이 driver 수정이 해당 모델의
semantic 실패나 S22 전체 qualification을 해결했다고 주장하지 않는다.
