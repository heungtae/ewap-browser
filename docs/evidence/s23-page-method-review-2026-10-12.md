# S23 리뷰 후 구현·검증 — 2026-10-12

## 판정과 revision

**Completed — Browser-local 지원 범위의 구현·통제 회귀·실제 Provider holdout/UI qualification 완료.**
검증 revision은 기준 HEAD `6da726b4b` 이후의 당시 uncommitted 작업 트리, 버전 `0.1.106`이다. 구현과 이 증거는 동일한 S23 후속 커밋에 포함한다.
실행 환경은 Linux, pinned pnpm 9.15.4와 Playwright Chromium 1217이다.
운영 사이트, 임의 모델, Platform, Store와 배포는 확인하지 않았다.
[이전 구현·실패 기록](s23-provider-page-method-2026-10-11.md)은 당시 범위로 보존한다.

## 수정과 코드 근거

- [MAIN registry](../../extension/src/service-worker/page-method-registry-main.ts)는 함수와 receiver의 실제 객체 identity를 보관한다. 동일 소스의 새 closure/receiver, navigation, Worker 재시작은 기존 ref로 실행할 수 없다. registry token은 Provider inventory와 진단에서 제외한다.
- [runner](../../extension/src/service-worker/page-method-runner.ts)는 원래 request/generation/document과 provider invocation ID를 결속한다. 비동기 검증 뒤에도 중복 소비를 확인한다. 같은 call의 동시 승인에는 dispatch 1회, 별도 승인 call에는 의도된 반복을 허용한다. timeout/Stop/예외 후 자동 재호출하지 않는다.
- [plan binding](../../extension/src/service-worker/page-method-plan.ts)은 method ref, 정확한 JSON 인수 digest, plan ID/revision을 검사한다. invocation 진행 cursor와 검증된 단계 수를 분리해 반환만으로 VERIFIED를 만들지 않는다.
- [return projection](../../extension/src/service-worker/page-method-return-data.ts)은 undefined/null, unsupported/truncated/masked, UTF-8 크기를 구분한다. getter/toJSON을 호출하지 않고 별도 runtime-data grant 뒤 최대 8192 bytes를 전달한다.
- [goal reassessment](../../extension/src/service-worker/act-goal-reassessment.ts)는 반환 후 plain answer만 온 경우 구조화된 read-only 목표 판단을 요청한다. 반환은 데이터 계산 목표의 근거가 될 수 있으나 서버 저장 증거가 아니다. action UNKNOWN을 변경하거나 mutation을 반복하지 않는다.
- `page_method_enabled` 설정을 끄면 동적 탐색/호출만 중지한다. 기존 설정의 누락 값은 true로 이전한다. Ask와 source/component 전용 요청은 runtime 탐색을 실행하지 않는다.
- 승인 review/permission/consent 이벤트는 저장 이력에서 제외한다. raw tool return, 인수와 registry identity는 trace/ZIP에 보관하지 않는다. 사용자의 입력과 모델의 사용자용 답변은 기존 대화 이력 정책을 따른다.

## 실행 결과

통제 행렬 16개(full, ask[Act 수동 승인 설정], source/action/risk/return deny, throw, timeout, stop,
navigation, replacement, repeat, secret, holdout, disabled, ui)가 모두 통과했다.
후속 변경 후 plan, 동일 함수의 receiver replacement, timeout, secret ZIP을 다시 실행해
4개 모두 통과했다. plan은 두 단계의 각각 승인·실행을 확인한다.
원래 tool call ID 결과는 transcript에 1회, 기본 호출은 1회, repeat/plan은 2회였다.
secret 검사는 실제 UI에서 진단 ZIP을 다운로드해 fixture secret/registry locator 부재를 확인한다.

- unit: 인수/분류 privacy 보강 후 186 files / 882 tests PASS.
- fixture/E2E: 각각 1 test PASS.
- typecheck/lint: PASS. 최초 lint의 정규식 불필요 escape를 수정했다.
- module boundary: PASS, 350 files. 최초 plan type 순환 참조를 발견해 별도 타입 파일로 분리했다.
- version-preserving build/package validation: PASS, 버전 0.1.106 유지.
- S16 Chrome: source tools, continuation/coverage, 동의/거부, Stop, source change/navigation/restart 회귀 PASS.
- S10 Chrome: 등록 API R0, 승인, document binding, timeout/Stop/restart/replay/masking 회귀 PASS. 최초 harness가 신규 metadata consent에서 대기하여 동의 처리 후 재실행했다.
- S22 rollback: feature off로 기존 DOM/control/navigation 9개 Chrome 사례 PASS.
- S17: 동의 처리 보강 후 search/deny/preview/anchor-menuitem 4개 PASS.
- S18: saved-match/saved-mismatch 2개 PASS. 최초 mismatch harness가 검토 전 transient idle에서 조기 종료했다. 실제 mismatch verdict까지 대기하도록 보강한 뒤 통과했다.
- S19: table/tree-expand-action/paging-action PASS. sensitive에서 classifier와 ancestor name의 원시 page data 전송을 발견해 FAIL. 두 경로를 수정한 후 table/tree-expand-action/sensitive 모두 PASS, Provider egress와 실제 ZIP 검사 PASS. [ISS-20261012-002](../issues/records/2026-10-12-intent-classifier-page-data.md)는 이 통제 범위에서 해결했다.

안전한 실행 산출물은 `/tmp/s23-matrix-final.json`, `/tmp/s23-matrix-targeted.json`,
`/tmp/s23-plan-privacy.json`, `/tmp/s23-rollback-s22.json`이다. 원문 ZIP/자격증명은 저장소에 넣지 않았다.

## 실제 Provider와 실패 이력

OpenRouter `nvidia/nemotron-3.5-lightning:free` holdout에서 실제 모델의 source 검색·읽기,
`ledgerOps.combineAmounts` 선택, 정확한 승인 호출, returned 데이터의 같은 대화 수신,
구조화된 completed 목표 판단이 **PASS**다. 1회 dispatch, 1회 call-ID result를 확인했다.
근거: `/tmp/s23-openrouter-goal.json`.

이전 실제 모델 시도에서 데이터 계산을 source-only로 잘못 분류했고, 이후에는 반환 뒤
plain answer 또는 UI 변화가 없다는 이유로 incomplete를 보고했다. 각각 intent/goal 계약과
read-only reassessment를 수정한 뒤 위 holdout이 통과했다. 이 기록은 HTTP 성공만을 뜻하지 않는다.

독립 UI 변경/수동 승인 live 사례는 HTTP 429로 실행되지 못했다. 같은 모델과
`openrouter/free` 재시도 모두 첫 분류 요청에서 429, 메서드 dispatch 0회였다.
proxy의 HTTP 오류 처리 shadowing도 수정해 실패 report와 cleanup을 보존했다.
당시 비대화형 실행 환경에는 `OPENAI_API_KEY`가 없어 prerequisite 단계에서 중단했다.
사용자 확인 후 `~/.bashrc`의 인터랙티브 셸 환경을 불러오자 키가 사용 가능했다.
키 값은 출력·복사·evidence 저장하지 않았다.
근거: `/tmp/s23-openrouter-ui-safe.json`, `/tmp/s23-openrouter-ui-routing.json`.

## R01–R20 수용 범위

| 범위 | 이번 근거와 제한 |
| --- | --- |
| R01/R18 | controlled holdout + 실제 Provider holdout PASS. OpenRouter UI는 429였으나 OpenAI UI 재검증 PASS |
| R02 | S16 Chrome coverage/chunks/denial/change 회귀 PASS; 불완전 읽기를 전체 분석으로 표시하지 않음 |
| R03/R04 | unit own-property/getter/identity + Chrome receiver replacement PASS. prototype/private/module 함수는 지원하지 않음. Proxy reflection trap은 발생할 수 있음 |
| R05/R06 | Ask 모드 무호출 Chrome (`ask-mode`), Full/manual와 source/action/risk/return denial Chrome PASS. local/enterprise hard-deny unit PASS; 실제 회사 PDP/Chrome 권한 운영 환경은 미검증 |
| R07/R08 | bounded JSON/민감 인수/부족 인수 거부, exact plan/ref/argument/request revision unit + 2-step Chrome plan PASS. JS의 동적 의미 타입은 자동 추론/검증하지 않음 |
| R09/R15 | 별도 return deny Chrome + UTF-8/undefined/null/cycle/function/getter/toJSON unit PASS. OpenAI 수동 승인 UI에서 별도 source/runtime-data 동의와 반환 전달 PASS |
| R10/R11/R12 | cancellation/navigation/timeout/exception Chrome 및 duplicate/concurrent/restart unit PASS. Worker restart 자동 재개 없음 |
| R13/R14 | policy migration/feature toggle/enterprise deny unit, S10 replay/restart Chrome PASS. 실제 settings/Provider 교체 운영 및 Platform 통합은 미검증 |
| R16/R17 | non-UI goal 실제 Provider PASS, UI controlled PASS; partial/unsupported/masking unit 및 secret ZIP PASS. prompt injection은 untrusted 데이터 경계를 유지하며 모든 모델의 저항성을 입증하지 않음 |
| R19/R20 | API hint 안내/설정 rollback, persistence/trace 검사, S10/S16/S22 회귀 PASS. S17/S19 회귀 PASS. 남은 운영 범위는 별도 기록 |

## 종료 조건 충족과 별도 범위

OpenAI `gpt-6-luna` 독립 UI fixture에서 source consent, 수동 승인, 소스 근거에 따른
`widgetActions.renderTotal` 선택, 1회 dispatch, 1회 동일 call-ID result, returned 합계 7,
후속 `report_goal_status: completed`와 최종 `#sum-result` 값 7을 확인했다.
근거: `/tmp/s23-openai-ui-rerun.json`, `/tmp/s23-openai-ui-rerun.log`.

첫 OpenAI 실행은 호출/반환까지 성공했으나 후속 goal 판단 요청에서 HTTP 503으로 실패했다.
이 실패를 `/tmp/s23-openai-ui.json`에 보존했다. 누락된 proposal metadata가 test reporter의
TypeError를 일으킨 부분도 빈 목록으로 처리하도록 수정했다. 재검증은 새 격리 Chrome
fixture에서 수행했으며, 실패한 실제 업무 mutation을 자동 재실행하는 동작을 추가하지 않았다.

따라서 명시한 Browser-local 지원 범위로 S23를 Completed로 갱신한다.
운영 사이트/임의 모델/실제 회사 PDP/Chrome 권한 운영 환경/Platform/설치·배포는
기존 별도 backlog다. prototype/private/module 함수 지원과 임의 JS 의미 타입 추론도
이번 지원 범위에 포함하지 않는다. 이 완료 상태로 외부 범위의 성공을 주장하지 않는다.

최종 production Worker SHA-256: `96cfbbc8f4d578e38f17cd76cb2b46a94a569f8732c3d7e0d9d98f6874e33aa3`. 최종 typecheck/lint/module-boundary/package PASS, unit 186 files/882 tests PASS.
Classifier privacy 변경 후 full/plan/secret Chrome 3개 PASS. ancestor name 수정 후 S19 table/tree-expand/sensitive PASS. 계획의 raw JSON 인수는 저장되는 assistant 요약에서 제거하며 실행 직전 review 이벤트에서 확인한다.

최종 history 수정 bundle의 plan/secret 재실행 2개 PASS (`/tmp/s23-plan-history-final.json`).
별도 Ask 모드 사례 PASS (`/tmp/s23-ask-mode.json`): method tool 미제공, 실제 호출 0회.
기존 `ask` case는 Ask 모드가 아니라 Act의 수동 승인 설정 사례다.
S18 재실행 근거는 `/tmp/s23-s18-final.json`이며 새 동적 ref를 저장·서명된 Workflow 능력으로 이전하지 않는다.

## 기존 Sprint 충돌의 처리 근거

| 충돌 | 현재 처리와 이번 확인 |
| --- | --- |
| X01/X03/X04 | consent-gated request-local method schema/executor를 추가. 기존 adapter와 새 동적 호출을 분리하며 S10/plan/controlled 및 live holdout에서 확인 |
| X02/X05 | static source/component read가 호출 권한을 주지 않음. read-only 경계 unit, S16/S19와 Ask Chrome 회귀 |
| X06/X07 | 원래 request/document/generation/identity 결속, Stop/navigation/timeout 및 concurrent duplicate/restart 검증. UNKNOWN 자동 재호출 없음 |
| X08 | source 근거·정확한 JSON 인수·plan revision 확인. 민감/누락/과대 인수 거부 unit, 두 단계 계획 Chrome |
| X09 | invocation receipt, action UNKNOWN, goal assessment를 분리. non-UI 계산 목표는 반환 근거 허용, 서버 persistence는 별도 근거 요구 |
| X10 | approval migration/별도 return grant/Full/manual/deny와 feature rollback 검증. 기존 deny와 policy 교집합 유지 |
| X11 | request-local 계획만 지원, signed Workflow/Profile에는 동적 능력을 저장하지 않음. enterprise denial unit 및 S18 원본 검토 회귀 |
| X12 | Browser-local 증거에 한정. 기존 Community/Enterprise/Platform backlog는 이번 변경으로 완료 처리하지 않음 |
