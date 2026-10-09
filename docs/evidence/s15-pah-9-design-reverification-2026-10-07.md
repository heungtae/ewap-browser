# S15 / PAH-9 설계 적합성 재검토 — 2026-10-07

## 판정과 범위

**기존 P1 두 건의 재현은 해소됐으나 P2 세 건이 남아 설계 적합성 완료 판정을 보류한다.**
이 기록은 [최초 리뷰](s15-pah-9-design-review-2026-10-07.md)의 R1~R6 수정 재검토다.
[34번 설계 9.1절](../34-page-act-context-harness-design.md#91-llm의-입력값-판단과-실행-결속)과
[S15 / PAH-9 완료 기준](../sprints/s15-pah-9-llm-input-value-binding.md)을 따른다.

- 검토 대상: `HEAD fadab78fe4aa79ba3d50f7fadebd3cd4c07e2a77` 위의 수정된
  작업트리. 미커밋·untracked 파일을 포함하며 HEAD 단독 검증이 아니다.
- Linux, Node `v20.19.6`, Vitest `3.2.4`에서 실제 제품 모듈을 import해 재현했다.
- Provider와 실행 dependency는 테스트 더블이다. 실행 진입 횟수는 실제
  Chrome DOM mutation 횟수가 아니다. Provider payload와 trace는 실제
  제품 연결/기록 모듈을 통해 확인했다.
- 제품 코드 수정, extension build/package, Chrome/live Provider/holdout,
  실제 진단 ZIP 생성 및 배포는 이번 재검토에서 수행하지 않았다.

## 기존 지적의 재검토 결과

| 최초 지적                                      | 이번 관찰                                                                                                               | 판정                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| R1 기존 세션 승인으로 새 single_step 입력 실행 | 새 입력은 승인 카드 1건, 실행 진입 0건                                                                                  | 기존 재현 해소                        |
| R2 clarification 응답 원문 trace               | method.result 및 request-scoped snapshot에 재현값 없음                                                                  | 기존 재현 해소. 실제 ZIP은 미실행     |
| R3 Workflow에서 질문 응답 누락                 | 실제 두 번째 Provider payload에 응답 포함                                                                               | 기존 재현 해소                        |
| R4 계약 오류 즉시 종료                         | 오류 결과를 전달한 뒤 보완 값은 ACTION_REVIEW, target 없는 질문은 CLARIFICATION. fresh target 있는 질문은 실패          | 부분 해소, F1/F2 잔여                 |
| R5 schema/parser 필수 필드 불일치              | legacy target-only는 수락. option 출처 revision도 parser는 선택 필드로 수락하지만 승인 후 거부되고 모델에 반환되지 않음 | parser 재현 해소, 실행 연결은 F2 잔여 |
| R6 긴 값의 구분 불가                           | 잘림 flag·전체 길이·안내 추가. 같은 길이의 다른 suffix는 여전히 동일하게 표시되며 전체 값 확인 수단 없음                | 부분 해소, F3 잔여                    |

기존 missing-value 재현은 두 번 연속 같은 잘못된 제안을 반환한다.
이번 실행에서 Provider 2회 후 FAILED가 된 것은 추가된 1회 보완 budget의
종료 동작이며, 최초의 즉시 종료 결함이 그대로 남았다는 의미가 아니다.
별도로 두 번째 응답을 올바른 값 또는 질문으로 바꿔 성공·실패 경로를 검증했다.

## F1 — [P2] 오류 보완 턴의 fresh target을 가진 질문이 잘못된 resolver로 실패함

위치: [act-step-runner.ts:540](../../extension/src/service-worker/act-step-runner.ts#L540).
ref 재생성: [act-step-runner.ts:621](../../extension/src/service-worker/act-step-runner.ts#L621).

계약 오류 후 `currentModel`을 새로 생성하고 그 ref를 새 tool schema에
제공한다. 수정된 입력 제안은 `currentModel.resolve`로 처리하지만
`request_clarification`만 최초 턴의 `model.resolve`를 사용한다.
새 schema에서 선택한 유효한 target이 최초 map에 없으므로 질문이 거부된다.

재현:

1. 첫 Provider 응답은 값 없는 `propose_set_text`다.
2. 두 번째 응답은 새 schema의 target enum을 사용한 유효한
   `request_clarification(question, value_kind=text, target)`다.
3. 오류 반환·ref 교체·질문 카드·종료를 확인한다.

관찰: `sawError=true`, `refsRefreshed=true`, `providerCalls=2`,
`error=TARGET_NOT_ACTIONABLE`, `questionCards=0`, `ended=1`.
같은 보완 턴에서 target을 생략한 질문과 올바른 값 제안은 성공했다.
따라서 오류 보완 자체가 아닌 targeted clarification의 ref 결속 문제다.

종료 기준: 보완 턴의 질문도 그 턴에 제공한 currentModel의 ref로 검증한다.
target 있는/없는 질문과 보완 입력을 모두 확인하고 이전 ref는 거부한다.
정상 질문은 mutation 없이 사용자 응답을 기다려야 한다.

## F2 — [P2] option 출처 누락·stale 값은 승인 후 거부되고 모델에 반환되지 않음

위치: [act-step-runner.ts:515](../../extension/src/service-worker/act-step-runner.ts#L515),
[act-proposal-readiness.ts:73](../../extension/src/service-worker/act-proposal-readiness.ts#L73),
[act-proposal-readiness.ts:84](../../extension/src/service-worker/act-proposal-readiness.ts#L84),
[act-proposal-executor.ts:216](../../extension/src/service-worker/act-proposal-executor.ts#L216).

새 보완 loop는 값 없는 text proposal만 승인 전에 검사한다. 다음 두
경우는 parse를 통과해 사용자에게 승인 카드가 먼저 표시된다.

- 현재 request revision이 1인데 text proposal의 value_source_revision이 2인 경우.
- offered schema상 선택 필드인 value_source_revision을 생략한 option proposal.

사용자 승인에 대응하는 executor를 호출하면 readiness가
`VALUE_BINDING_INVALID`를 반환하고 executor는 이를 그대로 호출자에게
돌려준다. 해당 오류를 tool result로 모델에 전달하거나 새 제안을 받지 않는다.
실행 자체는 차단되지만 수정된 R4의 모델 보완 경로가 적용되지 않는다.

두 조건 모두 실제 runner와 proposal executor를 연결해 확인했다.
권한은 격리 PermissionManager의 run-scoped type 허용을 사용하고,
변경 실행 dependency는 호출 시 실패하도록 설정했다.

관찰: `stateBeforeApproval=ACTION_REVIEW`, `reviewEvents=1`,
`approvalResult={ok:false,code:VALUE_BINDING_INVALID}`,
`providerCalls=1`, `contractErrorReturnedToModel=false`, `executions=0`.

종료 기준: 값과 출처 revision의 기술적 결속 오류는 승인 UI 전의
보완 경로에 포함한다. schema·parser·실행이 지원하는 신규/legacy
option 계약을 명확히 하고, 같은 call_id의 오류 → 제한된 모델 보완 →
새 제안/질문 → 새 승인 경로를 검증한다. 검증을 통과하지 않은 값의
실행은 계속 차단해야 한다.

## F3 — [P2] 긴 값의 잘림 안내만으로는 적용할 값·변경 내용을 확인할 수 없음

위치: [act-review-presentation.ts:50](../../extension/src/service-worker/act-review-presentation.ts#L50),
[entry.ts:724](../../extension/src/sidepanel/entry.ts#L724).

첫 512자·전체 길이·잘림 여부가 전달되고 안내도 추가됐다. 그러나
`"x".repeat(512)+"suffix A"`와 `"x".repeat(512)+"suffix B"`는 모두
520자이므로 preview·길이·flag가 전부 같다. 승인 화면은 “끝까지
확인하고 승인하세요”라고 표시하지만 나머지 원문을 보거나 변경된
뒷부분을 확인할 수 있는 연결이 없다. 실행에는 전체 값이 사용된다.

관찰: `previewEqual=true`, `lengthEqual=true`, `bothTruncated=true`.
동일한 세션/proposal metadata로 생성한 두 actionView 전체도 동일했다.
실제 proposal ID의 변경은 사용자에게 적용할 값의 차이를 보여주지 않는다.

추가된 단위 테스트도 같은 suffix 길이의 두 값이 동일 preview와 길이를
가지는 것을 허용하며 flag와 validator 통과만 검사한다. 이 PASS는
전체 값/변경 확인이 가능하다는 증거가 아니다.

종료 기준: 기존 민감값 표시 정책을 유지하면서 승인할 전체 값이나
차이를 확인할 수 있게 한다. 같은 길이로 suffix만 바뀐 제안을 실제
승인 화면에서 구별할 수 있어야 한다. 전체 확인을 지원하지 않는다면
지원 범위와 실행 계약을 일치시키고 보이지 않는 내용을 그대로 승인하게
하지 않는다.

## 검증 결과와 증거 한계

| 검증                                                                               | 결과                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------- |
| `./node_modules/.bin/tsc --noEmit`                                                 | PASS                                     |
| `./node_modules/.bin/vitest run extension/tests/unit --reporter=dot`               | 128 files / 602 tests PASS               |
| 최초 재현을 현재 모듈로 재번들·실행                                                | R1/R2/R3 및 legacy parser 재현 해소 확인 |
| 보완 턴 3가지 응답, stale text revision, option source 누락, 같은 길이 suffix 비교 | F1~F3 재현                               |
| Chrome/live Provider/holdout/실제 ZIP                                              | 이번 재검토에서는 미실행                 |

임시 파일은 `/tmp/s15-rereview-repro.ts`, `/tmp/s15-rereview-repro.mjs`,
`/tmp/s15-rereview-unit.log`다. 영구 저장소 증거 파일이 아니므로
조건·결과는 이 문서에 기록했다.

추가 재현의 실제 출력:

```jsonl
{"case":"corrected_value","state":"ACTION_REVIEW","sawError":true,"refsRefreshed":true,"providerCalls":2,"executions":0,"ended":0}
{"case":"clarification_without_target","state":"CLARIFICATION","sawError":true,"refsRefreshed":true,"providerCalls":2,"executions":0,"ended":0}
{"case":"clarification_with_fresh_target","error":"TARGET_NOT_ACTIONABLE","sawError":true,"refsRefreshed":true,"questionCards":0,"providerCalls":2,"executions":0,"ended":1}
{"case":"stale_value_revision","stateBeforeApproval":"ACTION_REVIEW","approvalResult":{"ok":false,"code":"VALUE_BINDING_INVALID"},"reviewEvents":1,"contractErrorReturnedToModel":false,"providerCalls":1,"executions":0,"ended":0}
{"case":"R6_preview_and_metadata","previewEqual":true,"lengthEqual":true,"bothTruncated":true,"fullViewEqual":true}
{"case":"option_missing_revision","stateBeforeApproval":"ACTION_REVIEW","approvalResult":{"ok":false,"code":"VALUE_BINDING_INVALID"},"reviewEvents":1,"contractErrorReturnedToModel":false,"providerCalls":1,"executions":0,"ended":0}
```

## 검토 파일 식별

다음 SHA-256은 보고서 저장 전 확인한 작업트리 파일 기준이다.

```text
fe24c739b9fc6e7cdede2e54f88252f2cfc10b7122972f3ba490284fe84cf86c  extension/src/service-worker/act-step-runner.ts
312a836647ff505a1b48027e2c32ebb5d8658ab8d38a759fb8c37f0b3b2fc2ab  extension/src/service-worker/act-step-messages.ts
028573d5655f7867a1075a430fe5b1df5b9ef245ca19122199543d1b26dc7ecb  extension/src/service-worker/act-proposal-parser.ts
9c443107af8843919b5c7bee0c130a41cf1fa05393b9c2ac076d05700c58328c  extension/src/service-worker/act-proposal-readiness.ts
ac5106b1c6556b5b14e6918130c6bf1c75c071bc862b2b7a57f2950f8ae1c694  extension/src/service-worker/act-review-presentation.ts
40209b6a9374bacb505575364d0dd54f1fc955bef7e00d1c6c581fc5e7d00ffa  extension/src/diagnostics/trace-recording.ts
532f29c7ea40957c2a6c4dc0ad9c207a8d86164a2f78698425b1a5e5f4fa9133  extension/src/sidepanel/entry.ts
```

기존 리뷰는 이력으로 유지한다. 본 재검토는 전체 live 판단·Chrome
입력·취소·restart·ZIP 완료나 출시 승인을 의미하지 않는다.
