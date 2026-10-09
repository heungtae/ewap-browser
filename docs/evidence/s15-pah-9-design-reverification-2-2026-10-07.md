# S15 / PAH-9 설계 적합성 재검증 2 — 2026-10-07

## 판정과 범위

**재검증 1의 잔여 3건(F1~F3)이 해소됐다.**
이 기록은 [최초 리뷰](s15-pah-9-design-review-2026-10-07.md)의 R1~R6과
[재검증 1](s15-pah-9-design-reverification-2026-10-07.md)의 F1~F3 수정 결과를
같은 재현 조건으로 다시 확인한 것이다.
[34번 설계 9.1절](../34-page-act-context-harness-design.md#91-llm의-입력값-판단과-실행-결속)과
[S15 / PAH-9 완료 기준](../sprints/s15-pah-9-llm-input-value-binding.md)을 따른다.

- 검토 대상: `HEAD fadab78fe4aa79ba3d50f7fadebd3cd4c07e2a77` 위의 수정된
  작업트리. 미커밋·untracked 파일을 포함하며 HEAD 단독 검증이 아니다.
- Linux, Node `v20.19.6`, Vitest `3.2.4`에서 실제 제품 모듈을 import해 재현했다.
- Provider와 실행 dependency는 테스트 더블이다. 실행 진입 횟수는 실제
  Chrome DOM mutation 횟수가 아니다. Provider payload와 trace는 실제
  제품 연결/기록 모듈을 통해 확인했다.
- 제품 코드 수정, extension build/package, Chrome/live Provider/holdout,
  실제 진단 ZIP 생성 및 배포는 이번 재검증에서 수행하지 않았다.
  (build는 아래 검증 표의 `pnpm build` 1회에 한정하며 배포가 아니다.)

## F1~F3 수정과 재현 결과

### F1 — 보완 턴의 targeted clarification이 fresh ref로 검증됨

`act-step-runner.ts`의 clarification 분기가 최초 턴의 `model.resolve`를
사용하던 것을 `currentModel.resolve`로 변경했다. 0회차(최초 턴) 동작은
같고(`currentModel === model`), 보완 턴은 그 턴에 제공한 schema의 ref로
검증한다.

재현(첫 응답: 값 없는 text → 보완 응답: 새 schema target의 유효한 질문):

```jsonl
{"case":"clarification_with_fresh_target","state":"CLARIFICATION","error":"","providerCalls":2,"questionCards":1,"ended":0}
```

이전 관찰(`TARGET_NOT_ACTIONABLE`, `questionCards=0`, `ended=1`)과 대비된다.
같은 보완 턴의 target 없는 질문도 기존과 같이 CLARIFICATION으로 수렴함을
단위 테스트로 확인했다.

### F2 — stale·누락 revision이 승인 전 보완 경로에 포함됨

`parseProposalCall`의 harness 결속 검사를 값 누락에서
“값 누락·출처 누락·stale 출처” 전체로 확장했다. 거부된 제안은 R4의 1회
보완 턴(계약 오류 → 새 제안/질문)으로 회수되며 승인 카드는 보완된
결속에만 표시된다. `act-proposal-readiness.ts`와 executor의 동일 검사는
dispatch 심층방어로 유지했다.

재현:

- stale text revision(현재 1인데 제안이 2): 보완 후 ACTION_REVIEW,
  카드는 보정된 값 1건에만 표시, `providerCalls=2`.
- 출처 없는 option: 보완 후 ACTION_REVIEW, 카드 1건, `providerCalls=2`.
- stale 값을 승인 경로로 직접 넣은 경우 dispatch에서
  `{"ok":false,"code":"VALUE_BINDING_INVALID"}`, `executions=0`.

```jsonl
{"case":"stale_value_revision_at_dispatch","approvalResult":{"ok":false,"code":"VALUE_BINDING_INVALID"},"executions":0}
```

### F3 — 같은 길이 suffix 변경이 승인 화면에서 구별됨

`actionView`가 잘림(512자 초과) 시 tail 64자 excerpt와 전체값 지문
12자를 함께 전달한다. 계약(`ChatActionView`)과 검증 allowlist에
`suggested_value_tail`·`suggested_value_digest`를 추가하고 승인 문구에
뒷부분·지문·전체 길이를 표시한다. 짧은 값의 카드 형태는 그대로다.
`actionView` 반환 타입을 `ChatActionView`로 명시해 이벤트 계약과 일치시켰다.

재현(`"x".repeat(512)+"suffix A"` 대 `"suffix B"`):

```jsonl
{"case":"R6_preview_and_metadata","previewEqual":true,"lengthEqual":true,"tailDiffers":true,"digestDiffers":true}
```

이전 관찰(`동일 preview·길이·flag로 구별 불가`)과 대비된다. 기존 단위
테스트도 “같은 preview라도 tail·지문이 다름”을 단언하도록 강화했다.

## R1~R6 최종 상태

| 최초 지적 | 이번 관찰 | 판정 |
| --- | --- | --- |
| R1 세션 승인으로 새 single_step 입력 실행 | 새 입력은 승인 카드 1건, 실행 진입 0건 | 해소 유지 |
| R2 clarification 응답 원문 trace | method.result 및 request-scoped snapshot에 재현값 없음 | 해소 유지. 실제 ZIP은 미실행 |
| R3 Workflow에서 질문 응답 누락 | 두 번째 Provider payload에 응답·tool_call 포함 | 해소 유지 |
| R4 계약 오류 즉시 종료 | 오류 1회 반환 후 보완 값은 ACTION_REVIEW, 질문은 CLARIFICATION, 2회 연속 오류는 budget 종료 | 해소 |
| R5 schema/parser 필수 필드 불일치 | legacy target-only 수락, 값·revision 짝·option 선택 유지, harness 결속은 승인 전 검사 | 해소 |
| R6 긴 값의 구분 불가 | 잘림 flag·전체 길이·tail·지문으로 같은 길이 suffix 구별 | 해소 |
| F1 보완 턴 질문의 stale resolver | fresh ref로 질문 카드 1건, 종료 없음 | 해소 |
| F2 승인 후 거부되는 결속 오류 | 승인 전 보완으로 회수, dispatch 거부는 심층방어로 유지 | 해소 |
| F3 같은 길이 suffix 구별 불가 | tail·지문으로 구별, 테스트 강화 | 해소 |

unit·contract 레벨의 지적은 남지 않았다. 최초 리뷰의 live 판단·Chrome
검증 범위(값 판단 정확성, 실제 입력·취소·restart, holdout, 외부 계약·
Platform 통합)는 여전히 미검증이며 이 문서로 완료를 주장하지 않는다.

## 수행한 검증

| 검증 | 결과 |
| --- | --- |
| `pnpm typecheck` (`tsc --noEmit`) | PASS |
| `pnpm lint` (eslint `--max-warnings=0` + prettier `--check`) | PASS |
| `pnpm test:unit` | 128 files / 605 tests PASS (F1 재시도 질문, stale 보정, option 보정, 2회 연속 오류 종료, R6 tail·지문 포함) |
| `pnpm test:fixture` | 1 file / 1 test PASS |
| `pnpm test:e2e` | 1 file / 1 test PASS |
| `pnpm build` (typecheck + version bump + bundle) | PASS, 0.1.97 → 0.1.98, `dist-extension` 생성. 배포가 아님 |
| `node scripts/check-module-boundaries.mjs` | PASS, 265 files |
| `node scripts/check-method-trace-coverage.mjs` | PASS, 1531 methods/callbacks in 167 runtime modules |
| 최초·재검증 1 재현의 현재 모듈 재실행 | R1/R2/R3/R5 해소 유지, F1~F3 해소 확인 (위 JSONL) |
| Chrome / live Provider / holdout / 실제 ZIP | 미실행 |

임시 재현 파일(`/tmp/s15-f1f3-verify-repro.ts`,
`/tmp/s15-f1f3-verify-repro.mjs`)은 삭제했다. 영구 저장소 증거 파일이
아니므로 조건·결과는 이 문서에 기록했다. 재현 명령은 최초 리뷰와 같다.

```bash
./node_modules/.bin/esbuild /tmp/s15-f1f3-verify-repro.ts --bundle --platform=node --format=esm --outfile=/tmp/s15-f1f3-verify-repro.mjs
node /tmp/s15-f1f3-verify-repro.mjs
```

## 검토 파일 식별

다음 SHA-256은 보고서 저장 직전 확인한 작업트리 파일 기준이다.
후속 수정 시 같은 재현과 종료 기준을 새 revision에서 다시 확인해야 한다.

```text
d31fa9d6fbac4e11779586f665ba38baae5e823b4c4abcb5dc119c874ea1239f  extension/src/service-worker/act-step-runner.ts
312a836647ff505a1b48027e2c32ebb5d8658ab8d38a759fb8c37f0b3b2fc2ab  extension/src/service-worker/act-step-messages.ts
028573d5655f7867a1075a430fe5b1df5b9ef245ca19122199543d1b26dc7ecb  extension/src/service-worker/act-proposal-parser.ts
9c443107af8843919b5c7bee0c130a41cf1fa05393b9c2ac076d05700c58328c  extension/src/service-worker/act-proposal-readiness.ts
9bae342472080b1b3d2dc8583348ad120a4a427dec6eedd100a31b1187e060b5  extension/src/service-worker/act-review-presentation.ts
59b80fa4bc101a67729a0c7f044548c620d5412ffdcf31e8017a81380e5252a0  extension/src/service-worker/act-tools.ts
40209b6a9374bacb505575364d0dd54f1fc955bef7e00d1c6c581fc5e7d00ffa  extension/src/diagnostics/trace-recording.ts
bf42cbae15c0c518b4066678d389cf4a8bc88abcd33ee60ba7e34f24dca85326  extension/src/sidepanel/entry.ts
f5a47be64f3661f97372d2a122ce64a9ea9e7e8541e845e8e4270d7a17c8c2fc  extension/src/contracts/chat-event-types.ts
ad275d61df6d0e33fea118e6a36b4e46bdb3e7e476fb914006a941e3b8d75188  extension/src/contracts/chat-event-validation.ts
4a49bea5e260286c56c08768414648ff0defe385f78a79cc3fd47ba4d88715ca  docs/sprints/s15-pah-9-llm-input-value-binding.md
4ba3e4719862b82f6e408d8fde7beca5eedeec5f12ec620415ad79c54e8d0f36  docs/34-page-act-context-harness-design.md
```

기존 리뷰와 재검증 1은 이력으로 유지한다. 본 재검증은 unit·contract
레벨의 잔여 해소 기록이며 Sprint 완료·Chrome 입력·live 판단·ZIP 완료나
출시 승인 기록이 아니다.
