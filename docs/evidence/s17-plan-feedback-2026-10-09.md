# S17 계획·실행 결과 피드백 — 2026-10-09

## 판정과 범위

**In Progress.** C1~C6의 Browser-local 구현과 통제 검증을 연결했다.
지정 live Provider의 계획→승인→실행→목표 판단 전체 경로는 미통과다.
마지막 호출은 OpenRouter 무료 모델 일일 한도 HTTP 429로 실행 전에 종료했다.
운영 사이트, 임의 Provider, 배포와 Platform 활성화는 검증 범위에 포함하지 않는다.

[재현 방법](../test.md#s17-계획실행-결과-피드백-테스트),
[마스킹된 실행 요약·SHA-256](s17-plan-feedback-validation-2026-10-09.json),
[Sprint 기준](../sprints/s17-act-plan-execution-feedback.md)을 따른다.
버전 증가 없이 빌드한 확장 버전은 **0.1.98**이다.

## 구현과 계약

| 카드 | 실제 연결과 검증                                                                                                                                                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1   | `act-plan-schema/store/turns.ts`: 실제 `submit_plan` 도구, bounded schema, 현재 request revision·관찰 evidence 검증, 계획 저장·revision 증가·검토 카드. 기술 오류는 같은 call ID로 반환하고 한 번의 형식 보완만 허용한다. 미지원 단계를 삭제하지 않는다.       |
| C2   | `act-execution-inventory.ts`: 실제 제공 action/read schema, 권한, 결과 schema, 등록 Page API opaque action ref·옵션·completion·제한을 전달한다. 발견한 함수와 실행 등록을 구분한다.                                                                            |
| C3   | 계획 승인과 동작 승인을 분리한다. 계획 승인 결과는 `execution_authorized:false`다. 변경된 revision/document·값·실행 수단, 승인 재사용을 거부하며 기존 permission/executor 검사를 유지한다.                                                                     |
| C4   | DOM·등록 Page API·workflow 마지막 단계 결과를 원래 tool call ID로 반환한다. 읽기 transcript와 이전 실행 근거를 유지하며 최신 관찰에서 모델을 다시 호출한다.                                                                                                    |
| C5   | 승인된 같은 origin navigation은 새 document에 binding하고 이전 ref·계획·승인을 폐기한다. 비동기 결과는 기존 bounded verifier를 사용한다. 다른 origin/tab, 후속 관찰 실패는 UNKNOWN이며 자동 mutation 재시도하지 않는다.                                        |
| C6   | `act-goal-feedback.ts`와 typed outcome: 동작 VERIFIED와 모델 GOAL_VERIFIED를 구분한다. 명시적 `report_goal_status`의 최신 observation ID·snapshot digest를 검증한다. 실패/UNKNOWN은 모델 설명으로 성공 승격하지 않는다. 기존 terminal wire mapping은 유지한다. |

Side Panel은 “계획 검토”와 “계획 승인”을 표시하고 각 동작의 승인을 별도로 받는다.
이전 요청의 종료 이벤트보다 새 요청이 먼저 시작해도 새 review를 버리지 않도록
render gate를 초기화했다. S10 실제 Chrome 회귀에서 확인했다.
분류 응답에 여분 키가 있을 때는 원래 요청을 보존한 한 번의 형식 보완을 요청한다.
두 번째 응답도 부적합하거나 tool call이 있으면 읽기 전용으로 종료한다.
Stop 이후 action 권한을 부여하지 않는다.

## 검증 결과

- Vitest **142 files / 669 tests PASS**: 계획/변경/위조 evidence/unsupported/Stop,
  DOM·Page API·workflow 결과 반환, FAILED/UNKNOWN 우선, 새 document·origin·tab,
  관찰 실패, already satisfied, 목표 미완료, 분류 형식 보완, 민감정보 마스킹.
- 타입·ESLint·Prettier PASS. 모듈 경계 282개 PASS.
  method trace는 문서 41모듈, 183 runtime모듈의 1631 methods/callbacks PASS.
- 버전 보존 TypeScript 빌드·확장 bundle·package validation PASS.
- 실제 Chrome S17: 계획 UI·동작별 승인·단일/다중 입력·권한 거부·버튼·hash 이동·
  새 document 이동·400ms 비동기 결과의 **8개 통제 시나리오 PASS**.
- 실제 Chrome S10 Page API와 read-only adapter 회귀 PASS:
  승인/권한, 성공, already satisfied, API 없음, UNKNOWN, throw/timeout,
  Stop, scope, restart, replay 차단, 진단 마스킹.
- 실제 Chrome S15 입력 **6개 PASS**, S16 script 도구 **6개 PASS**.
- 보조 source-size 검사 **FAIL: 초과 파일 80개**. 새 production 7모듈은
  모두 200줄 미만이다. 기존 대형 runner/UI/Chrome driver는 이번 연결로 변경됐다.

최종 S17 재실행은 `/tmp/s17-current-controlled.json`을 사용했다.
동시에 시작한 앞선 재실행은 첫 fixture의 CDP 관찰 응답이 돌아오지 않아 중단했다.
새 Chrome profile로 단독 재실행했으며 중단한 실행과 예전 report는 최종 PASS에 계산하지 않았다.
원본 임시 report/log는 재현 보조 자료이며 저장소에는 인자·입력·Provider 원문을 제외한 요약만 기록한다.

## Live 결과와 남은 종료 조건

환경 변수 `OPENROUTER_API_KEY`, 모델 `nvidia/nemotron-3.5-lightning:free`를 사용했다.
실제 키는 문서·증거에 기록하지 않는다. 모델 fallback과 강제 tool choice는 사용하지 않았다.
기본 reasoning과 기본 60초 timeout에서 응답 body timeout이 발생했다.
진단용 `reasoning.enabled=false`·upstream 120초 재실행도 별도로 기록한다.
제품의 요청 전체 budget은 늘리지 않았다.

모델이 미지원 verifier/read/goal 도구를 action step으로 제출한 두 응답은 거부됐다.
이를 실행 가능한 단계로 코드에서 바꾸거나 제거하지 않았다. action step과 postcondition의
구분, 현재 revision/evidence enum과 보완 안내를 제공했다.
다른 실행에서는 분류 JSON의 여분 키로 Ask fallback이 발생했고 진단 ZIP에 입력 echo가
검출됐다. 이후 분류 형식 보완과 plan prose·raw arguments·classifier response·output/refusal
마스킹을 추가했다. 통제 Chrome과 자동 마스킹 검증은 통과했지만 동일 live 경로의 해결은
HTTP 429 때문에 확인하지 못했다. 이 실패를 해결 완료로 주장하지 않는다.

남은 조건은 같은 지정 모델의 실제 계획 제출·계획 승인·정확한 요청값 동작·추가 승인·
동일 call ID 결과 반환·최신 관찰 기반 목표 판단·진단 ZIP 마스킹 전체 PASS다.
일일 한도 해제 후 `docs/test.md`의 live 명령으로 재검증해야 한다.
단일 입력 PASS 이후에도 다중 입력 live와 운영 사이트 일반화는 별도 증거가 필요하다.
S18 구현은 이번 범위에 포함하지 않는다.
