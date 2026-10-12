# ISS-20261012-002 — Intent classifier의 원시 페이지 데이터 전송

- 발생/수정: 2026-10-12, 기준 HEAD `6da726b4b` 이후 작업 트리, 버전 0.1.106.
- 상태: 해결 — 통제 Chrome Provider egress/ZIP 범위. 운영 사이트·배포 미검증.
- 증상: S19 sensitive fixture에서 component 도구를 제공하기 전 Provider가 fixture secret을 수신해 privacy assertion이 실패했다. table/tree-expand/paging 사례는 통과했다.
- 원인: `ask-act-intent-router.ts`가 consent-gated 데이터 도구보다 먼저 `snapshot.visible_text` 원문을 분류 요청에 포함했다. 이 경로에는 component의 민감 필드 projection이 적용되지 않았다.
- 추가 원인: classifier 수정 뒤에도 semantic projection의 main 등 ancestor name이 민감 cell의 text를 다시 포함했다. `boundedTextContent`의 이름용 경로가 민감 descendant를 제외하지 않았다. 모든 bounded text에서 민감 descendant를 제외하도록 수정했다.
- 수정: intent classifier에는 사용자 요청만 보낸다. 페이지 데이터는 선택된 기존 acquisition/projection 도구의 승인·마스킹 경계를 거친다. page text의 지시문으로 action intent를 만들어내지 않는다.
- 회귀: `extension/tests/unit/service-worker/ask-act-intent-router.test.ts`에 민감 페이지 원문 미전송 테스트. S19 controlled Chrome `sensitive`에서 Provider egress와 diagnostics ZIP을 확인한다.
- 완료 조건: 단위 원문 미전송 검사와 S19 sensitive의 실제 Provider 경계/진단 ZIP 마스킹 PASS. 실제 운영 사이트나 모든 모델에 대한 증거로 확대하지 않는다.
- [S23 후속 검증](../../evidence/s23-page-method-review-2026-10-12.md). 수정 코드와 회귀 증거는 이 기록을 포함한 S23 후속 커밋으로 함께 추적한다.

검증: typecheck/lint/module boundaries/build/package PASS, unit 186 files/882 tests PASS. S19 table/tree-expand-action/sensitive PASS (`/tmp/s23-s19-privacy-final.json`), fixture/E2E 각각 1 test PASS. Sensitive Chrome에서 source/provider egress 검사와 실제 진단 ZIP 검사를 통과해 완료 조건을 충족했다.
