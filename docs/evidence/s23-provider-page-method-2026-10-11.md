# S23 Provider 페이지 메서드 구현·통합 확인 — 2026-10-11

후속 구현과 최신 검증은 [2026-10-12 리뷰 후 증거](s23-page-method-review-2026-10-12.md)를 참조한다. 아래 결과는 당시 revision의 이력이다.

## 범위와 판정

- 기준 HEAD: `67f38c098c518490b6ba980a7575c87320c00bb1`; 구현 작업 트리는 uncommitted이며 패키지 버전 `0.1.106`을 유지했다.
- 최신 판정(2026-10-12): **In Progress.** 아래 리뷰 수정으로 통제 Chrome 호출·결과 반환은 통과했다. 실제 Provider와 전체 수용 행렬은 남아 있다. 2026-10-11 실패 이력은 보존한다.
- 구현 범위: approval policy v1→v2 migration과 runtime result disclosure category, `page_method` capability, MAIN-world own-property discovery/invocation, request/document/argument/source-evidence binding, `propose_page_method_call` schema/parser/executor, 별도 runtime return consent, bounded serialization/redaction, UI approval copy와 unit coverage.
- 설계 조정: 별도 `list_page_methods`/`describe_page_method` 도구 대신 metadata 동의 후 요청별 candidate inventory를 노출하고 기존 script search/read result의 source evidence ID를 proposal에 요구한다. inventory는 source proof나 함수 identity 보증이 아니다.

## 실행한 검증

| 확인                                                                    | 결과                        | 근거와 제한                                                                                                                             |
| ----------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:unit`                                                        | PASS, 180 files / 851 tests | 통제 unit만 확인                                                                                                                        |
| `pnpm test:fixture`                                                     | PASS, 1 test                | live Provider를 확인하지 않음                                                                                                           |
| `pnpm test:e2e`                                                         | PASS, 1 test                | Chrome extension UI vertical slice를 확인하지 않음                                                                                      |
| `pnpm check:module-boundaries`                                          | PASS, 346 TypeScript files  | 모듈 경계 검사                                                                                                                          |
| `pnpm lint`                                                             | PASS                        | ESLint와 Prettier                                                                                                                       |
| `pnpm exec tsc -p tsconfig.build.json`                                  | PASS                        | strict build typecheck                                                                                                                  |
| `node scripts/build-extension.mjs && node scripts/validate-package.mjs` | PASS                        | 버전 변경 없는 extension artifact 생성 및 package validation                                                                            |
| S23 controlled Chrome smoke                                             | FAIL                        | 5 Provider turns, `propose_page_method_call` 미제공, method invocation 0회. fixture error report `/tmp/s23-page-method-controlled.json` |
| Source-bundled MAIN scanner direct injection                            | PASS, diagnostic only       | 같은 Chrome fixture에서 `mergeFigures` 후보가 반환됨. 이 DevTools 진단은 production Act inventory 연결 증거가 아님                      |
| Live Provider S23                                                       | NOT RUN                     | controlled Chrome gate가 실패해 semantic qualification을 시도하지 않음                                                                  |

## 당시 남은 blocking 조건 (후속 수정 전)

`page_method_discovery` 상태는 `empty`이고 Act가 method inventory 0개를 제공한다. 같은 fixture의 별도 DevTools MAIN-world injection은 `reportTools.mergeFigures`를 찾으므로, source fixture·method 자체보다 runtime Act discovery와 session inventory 사이의 통합 경계를 더 추적해야 한다. 호출 승인, dispatch exactly-once, return-data denial/allow, same-call-ID result continuation, 후속 goal judgement를 Chrome에서 입증하지 못했다.

따라서 S23-R01/R06/R09/R11/R12/R15/R16/R18의 runtime acceptance는 미완료이며 나머지 R02~R20 matrix, Stop/navigation/restart, custom/deny policy, rollback과 S10/S15~S22 Chrome regressions도 미실행이다. 실제 Provider, live site, Platform integration, release 범위는 검증되지 않았다.

## 2026-10-12 리뷰 수정과 재검증

같은 HEAD의 uncommitted 작업 트리, 버전 0.1.106. Chrome은
`/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`을 사용했다.
[ISS-20261012-001](../issues/records/2026-10-12-page-method-main-instrumentation.md)로 추적한다.

- 확인된 원인: build의 `methodTracePlugin`이 직렬화할 MAIN 함수를 계측해 extension 모듈의 trace 함수를 참조하게 했다. 별도 scanner bundle과 production artifact의 차이였다.
- 수정: 두 MAIN helper를 계측에서 제외했다. 빈 결과를 이유로 documentId/epoch 등록을 덮어쓰던 fallback과 동적 tool 추가·추가 chat turn 우회를 제거했다.
- 추가 리뷰 수정: native 함수 후보 제외, 반환 배열의 위치 보존과 getter 미실행, unsupported 객체의 truncated 표시, request signal 수명에 따른 소비 ref 관리.
- fixture 수정: 성공 반환 후 재호출 제안 방지. 같은 transcript가 여러 Provider 요청에 재전송되는 것을 중복 실행 결과로 집계하지 않고 마지막 요청의 동일 call ID 결과 수를 검사한다.
- PASS: typecheck, lint, 180 unit files/853 tests, fixture 1/e2e 1, module boundaries 346 files, method instrumentation regression, 버전 유지 build/package validation, diff whitespace.
- 통제 Chrome PASS: 6 Provider turns, 앱 메서드 후보 1개, script 목록·검색·읽기, proposal 1회, MAIN invocation 1회, 원래 call ID로 dispatched/returned 및 승인된 반환 데이터 전달, `report_goal_status` 후 UI 완료. 최신 안전 report는 `/tmp/s23-review-final.json`.
- 실제 Provider·사이트, custom/deny 및 cancellation/navigation/restart 전체 Chrome 행렬, Platform·release는 이번 리뷰에서 검증하지 않았다. 이 PASS는 전체 S23 Completed 증거가 아니다.
