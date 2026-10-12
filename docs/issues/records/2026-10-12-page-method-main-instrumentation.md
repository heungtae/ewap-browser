# ISS-20261012-001 — MAIN page-method helper의 빌드 계측 실패

- 발생: 2026-10-11, 리뷰 수정: 2026-10-12. 버전 0.1.106, HEAD `67f38c098c518490b6ba980a7575c87320c00bb1` + uncommitted 작업 트리.
- 상태: 해결 — 통제 Chrome 범위. 실제 사이트·Provider·배포는 미검증.
- 증상: 별도 source scanner 주입은 앱 메서드를 찾지만 production Act inventory는 empty이며 method tool을 제공하지 않는다.
- 원인: `scripts/method-trace-instrumentation.mjs`가 직렬화되는 MAIN helper에 extension 모듈의 trace 함수 참조를 추가했다. Chrome MAIN world에는 해당 closure가 없다.
- 수정: discovery/invoke MAIN 모듈을 계측 대상에서 제외. runtime discovery는 등록된 documentId만 사용하며 빈 inventory로 registration/page scope를 덮어쓰지 않는다. read loop의 추가 chat turn 우회도 제거했다.
- 회귀: `scripts/test-method-trace-instrumentation.mjs`에서 두 MAIN helper가 제외되는지 검사. `scripts/chrome-s23-page-method-smoke.mjs`는 production artifact로 script source→단일 invocation→원래 call ID 결과→후속 goal 판단을 확인한다.
- 완료 조건: 통제 Chrome에서 앱 메서드가 노출되고 실제 1회 실행되며 returned 결과가 같은 Provider 대화로 이어짐. 충족.
- 검증: typecheck/lint, unit 180 files/853 tests, fixture/e2e 각 1, module boundaries, instrumentation regression, package build/validation, S23 controlled Chrome PASS.
- [실행 범위와 실패 이력](../../evidence/s23-provider-page-method-2026-10-11.md). 수정 commit은 아직 생성하지 않았다. 전체 Sprint qualification은 별도 미완료다.

2026-10-12 후속: MAIN registry도 계측 제외 회귀에 포함했다. 기존 수정은 `6da726b4b`에 포함됐으며, 후속 미커밋 작업의 [행렬·실제 Provider holdout](../../evidence/s23-page-method-review-2026-10-12.md)은 별도 범위로 기록한다.
