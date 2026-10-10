# S15 / PAH-9 설계 적합성 리뷰 — 2026-10-07

## 판정과 검토 범위

**설계 적합성 미충족: 재현된 지적 6건(P1 2건, P2 4건)이 남아 있다.**
명확한 값의 자동 입력 준비와 일반 clarification 연결은 구현되어 있으나,
승인 결속·대화 유지·오류 복귀·원문 비노출 조건을 충족하지 못한다.
전체 단위 테스트 통과만으로 S15 / PAH-9를 완료로 판정할 수 없다.

- 기준: [34번 설계 9.1절](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/34-page-act-context-harness-design.md#91-llm의-입력값-판단과-실행-결속),
  [S15 / PAH-9 개발·완료 기준](../sprints/s15-pah-9-llm-input-value-binding.md).
- 대상: `HEAD fadab78fe4aa79ba3d50f7fadebd3cd4c07e2a77` 위의 **미커밋 변경 및
  untracked 구현 파일을 포함한 작업트리**. HEAD 단독 검증 결과가 아니다.
- 환경: Linux, Node `v20.19.6`, Vitest `3.2.4`.
- 방법: 설계와 schema/parser/승인/입력/clarification/모델 대화/trace 경로 대조,
  실제 모듈을 import한 격리 재현, 타입 검사 및 전체 단위 테스트.
- 이번 리뷰에서 제품 코드 수정, 버전 변경, extension build/package,
  Chrome 실행, live Provider 호출, 배포는 수행하지 않았다.

격리 재현은 실제 제품 모듈을 사용하되 Provider 응답과 실행 dependency를
테스트 더블로 대체했다. 따라서 아래의 실행 진입 횟수는 실제 DOM mutation
횟수가 아니며, 모델 선택의 정확성이나 실제 Chrome 성공 증거가 아니다.
trace와 요청별 진단 snapshot의 원문 포함은 실제 기록 모듈에서 확인했다.
실제 다운로드 ZIP은 생성하지 않았다.

## 설계 요구사항 대조

| 설계 요구사항                                               | 확인 결과                                                                                                               | 판정                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| LLM이 원래 요청·응답·최신 UI를 바탕으로 대상·값·질문을 판단 | 관련 prompt와 입력 제안/질문 도구 존재. 제품 코드의 업무 키워드·정규식 값 추출 분기는 확인되지 않음. live 판단은 미검증 | 코드 경로 확인, live 미검증 |
| 명확한 값은 승인 후 추가 value card 없이 입력               | parser → proposal → readiness → value slot 연결과 관련 단위 테스트 존재. 실제 Chrome 입력은 이번 리뷰에서 미실행        | 일부 확인                   |
| 질문 응답을 같은 conversation에 반환하고 새 제안 생성       | 일반 경로는 응답을 추가하나 Workflow payload에서 대화가 누락됨                                                          | R3 미충족                   |
| 변경된 대상·값 제안에 기존 승인 재사용 금지                 | 세션 continuation이 새 single_step 입력 제안의 승인 UI를 생략함                                                         | R1 미충족                   |
| 값 누락/schema 오류를 모델에 반환하여 보완·질문             | parser 오류가 FAILED 및 세션 종료로 처리됨                                                                              | R4 미충족                   |
| tool schema·parser·executor의 계약 일치 및 기존 입력 호환성 | schema 선택 필드를 parser는 필수로 취급                                                                                 | R5 미충족                   |
| 승인 화면에서 실제 적용할 값과 변경 내용을 확인             | 512자 이후 내용이 안내 없이 잘려 서로 다른 값이 동일하게 표시됨                                                         | R6 미충족                   |
| 원본 입력값을 trace·진단에 남기지 않음                      | clarification validator의 반환 원문이 method.result 및 요청별 snapshot에 포함됨                                         | R2 미충족                   |
| 타입·길이·enum·민감 대상·fresh ref·취소/재시작 보호         | 관련 검사 및 단위 테스트 존재. 모든 조합의 Chrome/live 검증은 이번 리뷰 범위 밖                                         | 전체 완료 판정 보류         |

## R1 — [P1] 기존 세션 승인이 새 single_step 입력 제안에 재사용됨

위치: [act-step-runner.ts:579](../../extension/src/service-worker/act-step-runner.ts#L579).
승인 범위 생성은 [act-proposal-parser.ts:278](../../extension/src/service-worker/act-proposal-parser.ts#L278).

설계 9.1절은 승인된 대상·값 제안의 동일성을 검사하고 대상·값·의도가
변경되면 기존 승인을 재사용하지 않도록 요구한다. 현재 runner는
`session.continueAfterApproval`만 있으면 새 proposal의 승인 범위를
확인하지 않고 `executeApprovedProposal(session)`을 호출한다.
텍스트 입력은 parser가 `single_step`으로 제한해도 이 분기를 통과한다.

재현 조건:

1. 앞선 click/navigation의 세션 승인으로 `continueAfterApproval=true`,
   `autoExecutionCount=1`인 세션을 사용한다.
2. 모델이 최신 textbox ref와 새 값·출처 revision을 가진
   `propose_set_text`를 반환한다. proposal 범위는 `single_step`이다.
3. 승인 이벤트와 실행 dependency 호출 횟수를 관찰한다.

관찰: `proposalScope=single_step`, `reviewEvents=0`, `executions=1`.
새 입력값을 검토·승인하기 전에 실행 경로에 진입했다.

수정·종료 기준: 기존 permission mode를 유지하면서 승인 범위와
대상·값·request/plan revision을 확인해야 한다. 세션 승인에 포함되지 않은
새 single_step 입력은 검토·승인 전에 실행 진입 0건이어야 한다.
명시적으로 승인된 동일 계획의 continuation과 재승인이 필요한 변경을
각각 검증한다.

## R2 — [P1] 추가 질문 응답 원문이 method trace와 진단 snapshot에 포함됨

위치: [value-binding.ts:213](../../extension/src/page-act-harness/value-binding.ts#L213),
[value-binding.ts:255](../../extension/src/page-act-harness/value-binding.ts#L255).
기록 경로: [method-trace.ts](../../extension/src/diagnostics/method-trace.ts),
[trace-recording.ts](../../extension/src/diagnostics/trace-recording.ts),
[trace-mask.ts](../../extension/src/diagnostics/trace-mask.ts).

설계는 실행값을 요청 수명 안에서만 사용하고 trace·진단 ZIP에 원문을
남기지 않도록 요구한다. `validateClarificationAnswer`는 원문 문자열을
반환하는 전체 함수를 `traceMethod`로 감싸고 있다. 길이만 기록하는
`traceDecision`과 별도로, wrapper가 반환값을 `method.result`에 기록한다.
root 문자열에는 `value`와 같은 민감 필드명이 없고 일반 문자열을 모두
마스킹하지 않으므로 원문이 남는다.

재현 조건:

1. 요청 ID가 있는 `withMethodContext` 안에서
   `validateClarificationAnswer("amber-moss-review", "text")`를 호출한다.
2. `method.result` 기록과 해당 요청의 `methodTraceSnapshot("worker", requestId)`를 확인한다.

관찰: `rawValuePresent=true`, `rawValueInRequestDiagnosticSnapshot=true`.
`amber-moss-review`는 재현용 합성 값이며 실제 사용자 비밀값이 아니다.

수정·종료 기준: 반환 원문까지 기록 경계에서 제거하고 길이·종류·revision·
판정만 남긴다. 선언형 masking summary가 아니라 실제 method records,
요청별 diagnostics 및 생성한 ZIP의 원문 부재를 검사해야 한다.

## R3 — [P2] Workflow clarification 응답이 다음 Provider payload에서 누락됨

새 응답 연결 위치:
[act-proposal-followup.ts:120](../../extension/src/service-worker/act-proposal-followup.ts#L120).
대화를 제외하는 기존 연결 지점:
[act-step-messages.ts:22](../../extension/src/service-worker/act-step-messages.ts#L22).

설계는 질문에 대한 실제 사용자 응답을 같은 conversation에 돌려주고
LLM이 대상·값을 검토해 새 제안 또는 수정된 계획을 만들도록 요구한다.
followup은 assistant 질문에 대응하는 tool result와 user 응답을
`session.messages`에 추가한다. 그러나 Workflow용 `actStepMessages`는
system 메시지 하나와 원래 요청·고정 단계·projection만 다시 구성한다.
새로 추가한 질문·응답 대화는 다음 Provider 요청에 들어가지 않는다.

재현 조건:

1. textbox 입력 단계가 있는 Workflow 세션에서 모델이 `request_clarification`을 반환한다.
2. value-card 채널의 followup으로 `amber-moss-review`를 제출한다.
3. 실제 runner continuation의 두 번째 Provider payload를 수집한다.

관찰: `storedInConversation=true`, `answerInSecondProviderCall=false`,
`providerCalls=2`. 이 재현의 두 번째 proposal은 테스트 더블이 고정
반환했으며, 모델이 사용자 응답을 이해했다는 증거로 사용하지 않는다.

수정·종료 기준: Workflow 경로도 질문의 tool_call_id, 실제 응답,
관련 request revision을 같은 conversation에 보존해야 한다.
generic와 Workflow 모두 질문 → 응답 → 모델 새 제안 → 승인 → 입력을
Provider payload 및 Chrome에서 확인한다.

## R4 — [P2] 값 누락/schema 오류를 모델에 반환하지 않고 FAILED로 종료함

위치: [act-step-runner.ts:540](../../extension/src/service-worker/act-step-runner.ts#L540),
[act-step-runner.ts:599](../../extension/src/service-worker/act-step-runner.ts#L599).
종료 처리: [act-run-failure.ts](../../extension/src/service-worker/act-run-failure.ts).

설계는 값이 빠진 실행 제안을 모델에 계약 오류로 반환해 보완 제안 또는
clarification을 받도록 요구한다. 현재 parser 예외는 runner의 catch에서
`failActRun`으로 이어져 요청을 FAILED로 만들고 세션을 종료한다.
같은 tool_call_id에 계약 오류를 반환하는 다음 모델 turn이 없다.

재현 조건: 현재 textbox의 유효한 opaque target과 승인 필드를 가진
`propose_set_text`에서 `value` 및 `value_source_revision`을 생략한다.

관찰: `error=INVALID_ARGUMENT`, `providerCalls=1`, `executions=0`,
`ended=1`, `outcome=FAILED`.

수정·종료 기준: 보완 가능한 계약 오류를 해당 call의 결과로 모델에
반환하고 제한된 budget 안에서 새 제안 또는 질문을 받는다. 취소·권한·
페이지 변경의 terminal 처리와 구분한다. 오류만으로 자동 value card를
띄우거나 추측값을 실행하면 안 된다.

## R5 — [P2] offered schema와 parser의 필수 필드 불일치 및 legacy 회귀

위치: [act-tools.ts:193](../../extension/src/service-worker/act-tools.ts#L193),
[act-tools.ts:224](../../extension/src/service-worker/act-tools.ts#L224),
[act-proposal-parser.ts:161](../../extension/src/service-worker/act-proposal-parser.ts#L161).

Sprint는 tool schema·parser·executor가 같은 계약을 사용하고 기존
target-only 제안의 전환·실패 처리를 명시하도록 요구한다.
`propose_set_text` schema는 `target`, `approval_scope`, `approval_reason`만
필수로 제공하지만 parser는 allowed keys 전체를 required로 사용한다.
따라서 schema상 유효한 target-only 제안을 parser가 거부한다.
readiness에 남아 있는 legacy value-card 분기에 도달할 수 없다.
option schema에서도 선택 필드인 `value_source_revision`을 parser는
필수로 검사한다.

재현 관찰:

```json
{
  "required": ["target", "approval_scope", "approval_reason"],
  "legacyTargetOnlyResult": "INVALID_ARGUMENT"
}
```

수정·종료 기준: 신규 입력의 값·출처 revision 필수 여부를 schema와 parser에
일치시킨다. legacy를 유지한다면 명시적 계약/version 또는 호출 경계에서
구분하고, 유지하지 않는다면 전환 처리를 구현·문서화한다. text/option 모두
실제 offered schema 기준의 유효·무효 호출을 검사한다.
R4는 오류 이후의 continuation, R5는 최초 계약과 호환성 문제다.

## R6 — [P2] 승인 화면에서 서로 다른 긴 입력값이 동일하게 표시됨

위치: [act-review-presentation.ts:45](../../extension/src/service-worker/act-review-presentation.ts#L45).
표시 소비 위치: [entry.ts:713](../../extension/src/sidepanel/entry.ts#L713).

설계는 검토·승인 화면에서 적용할 대상과 값을 확인하고 변경된 제안을
기존 승인과 구분하도록 요구한다. 현재 UI에는 첫 512자만 전달하고
실행에는 전체 값을 사용한다. 잘림·전체 길이·나머지 내용 확인 수단이 없다.

재현 조건: 앞 512자가 같고 끝이 각각 `suffix A`, `suffix B`인
520자 입력값 두 개에 대해 `actionView`를 생성한다.

관찰: `identicalDisplay=true`, `shownLength=512`, `actualLength=520`,
`truncationIndicator=false`.

수정·종료 기준: 기존 민감값 표시 정책을 유지하면서 잘림과 실제 길이를
표시하고 승인할 전체 값 또는 차이를 확인할 수 있어야 한다. 뒤쪽만 바뀐
제안을 동일한 값으로 오인하게 하지 않는지 실제 승인 화면에서 검증한다.

## 수행한 검증과 재현 결과

| 명령 또는 검증                                                       | 결과                       | 증거 범위                                                      |
| -------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| `./node_modules/.bin/tsc --noEmit`                                   | PASS                       | 현재 작업트리 타입 검사                                        |
| `./node_modules/.bin/vitest run extension/tests/unit --reporter=dot` | 128 files / 594 tests PASS | 전체 기존 단위 테스트. 위 연결 결함의 부재를 보증하지 않음     |
| 실제 모듈 import를 사용한 격리 재현                                  | 위 6건 재현                | Provider/실행 dependency는 더블. DOM mutation·live 판단 미검증 |
| request-scoped method trace snapshot                                 | 원문 포함 재현             | 실제 trace/진단 기록. 다운로드 ZIP 미실행                      |
| Chrome / live Provider / holdout                                     | 미실행                     | 이번 결과로 완료를 주장하지 않음                               |

리뷰 당시 임시 재현 파일은 `/tmp/s15-design-review-repro.ts`,
번들은 `/tmp/s15-design-review-repro.mjs`, 단위 테스트 로그는
`/tmp/s15-review-unit.log`다. 이 임시 파일들은 저장소 산출물이나 영구
보관 증거가 아니며, 시나리오·관찰 결과는 본 문서에 기록했다.

재현 실행 명령:

```bash
./node_modules/.bin/esbuild /tmp/s15-design-review-repro.ts --bundle --platform=node --format=esm --outfile=/tmp/s15-design-review-repro.mjs
node /tmp/s15-design-review-repro.mjs
```

기록한 실제 출력:

```jsonl
{"case":"schema_parser","required":["target","approval_scope","approval_reason"],"legacyTargetOnlyResult":"INVALID_ARGUMENT"}
{"case":"missing_value_model_continuation","error":"INVALID_ARGUMENT","providerCalls":1,"executions":0,"ended":1,"outcome":"FAILED"}
{"case":"prior_session_approval_new_single_step_value","proposalScope":"single_step","reviewEvents":0,"providerCalls":1,"executions":1,"ended":0}
{"case":"workflow_clarification_answer","storedInConversation":true,"answerInSecondProviderCall":false,"providerCalls":2,"executions":0,"ended":0}
{"case":"raw_answer_trace","rawValuePresent":true,"rawValueInRequestDiagnosticSnapshot":true,"recordCount":2}
{"case":"different_values_identical_review","identicalDisplay":true,"shownLength":512,"actualLength":520,"truncationIndicator":false}
```

## 검토 파일 식별

다음 SHA-256은 리뷰 보고서 저장 직전 확인한 작업트리 파일 기준이다.
후속 수정 시 같은 재현과 종료 기준을 새 revision에서 다시 확인해야 한다.

```text
83d79e7604086fcce86ce1e3e72dd8524e80dce72e75ebfd3311780b4fb4ab81  extension/src/service-worker/act-step-runner.ts
6bc2a3aa5df2eb35c60dc5326f6b91ed840901c10f49351097cc36f2dc1ee4f3  extension/src/service-worker/act-step-messages.ts
c37f9812f2e35e8e4833f6142ce37545bd46bc90547a47dfe7f63e86593003fb  extension/src/service-worker/act-proposal-parser.ts
7c1913edf45af43544d7edf7caba57e61ba8f81119707f2aea1c7be86ad9a6b9  extension/src/service-worker/act-tools.ts
f1fb25accf3da3d4f8d0f16db508f3f87b62e831344e461b7378795184063aac  extension/src/service-worker/act-proposal-followup.ts
b597adaeb764cbe8da6ff7ddf781ecdd3febdf145fbe983aca7f0ec7d780f992  extension/src/service-worker/act-review-presentation.ts
d25069b9abd0b8f97a4ea50d8037e5e0a64fbf97892939b5ea03480e414b4cec  extension/src/page-act-harness/value-binding.ts
4ba3e4719862b82f6e408d8fde7beca5eedeec5f12ec620415ad79c54e8d0f36  docs/34-page-act-context-harness-design.md
4a49bea5e260286c56c08768414648ff0defe385f78a79cc3fd47ba4d88715ca  docs/sprints/s15-pah-9-llm-input-value-binding.md
```

## 후속 완료 판정

R1~R6 수정 후 개별 재현을 회귀 테스트로 보강하고 실제 Chrome의
승인·질문·응답 continuation·DOM 입력·로컬 값 일치를 확인한다.
명확한 값, 값 미제공, 모호한 대응, 여러 필드·값, 사용자 정정,
stale 응답·Stop·navigation·worker restart, 잘못된 schema,
민감 대상과 privacy를 포함한다. live Provider/model별 판단과 holdout
증거는 통제 Provider 결과와 별도로 기록한다.

이 문서는 리뷰 결과 저장이며 수정 완료, Sprint 상태 변경 또는 출시
승인 기록이 아니다.
