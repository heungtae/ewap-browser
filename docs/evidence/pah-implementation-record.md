# PAH-0~8 구현 증거 기록 (Page Act Context Harness)

- 작성일: 2026-10-04
- 상태: unit/contract slice 완료. live Provider + Chrome 실행은 미검증.
- 기준: `docs/page-act-context-harness-design.md`, `docs/sprint-page-act-context-harness-plan.md`
- 원칙: 기존 문서 동기화는 사용자 확인 전 수행하지 않음 (동기화 검토 목록 유지).

## 공통

- 테스트 명령: `pnpm typecheck`, `pnpm lint`, `pnpm build`,
  `pnpm test:unit` (121 files / 533 tests PASS),
  `pnpm test:fixture` (PASS), `pnpm test:e2e` (PASS),
  `node scripts/check-module-boundaries.mjs` (PASS, 261 files),
  `node scripts/check-method-trace-coverage.mjs` (PASS)
- Chrome·provider·model: 미실행. live Provider 결과와 전체 실행 수·실패는 미검증.
- 실제 UI 전후 상태: 없음 (unit slice). 안전한 trace·masking은 각 모듈의
  `traceMethod/traceDecision/traceBranch` + `masking` metadata로 확인.
- Browser / Platform / workspace·통합: 미수행. 외부 계약 변경 없음
  (`assertNoExternalWireChange` PASS, `NEEDS_CONTRACT_REVIEW` 가드 유지).
- 빌드 성공, Chrome runtime 성공, live reasoning 성공, 배포는 별개로 보고함.
  본 기록은 빌드 성공만을 의미하며 live 추론 성공을 주장하지 않음.

## Sprint별

- PAH-0 `feat(pah-0)`: `page-act-harness/contracts.ts`, `compatibility.ts`.
  envelope/evidence/state-machine 계약, Preview 입력 도구누락 재현 원인 기록.
- PAH-1 `feat(pah-1)`: `bootstrap-composer.ts`, `capability-check.ts`.
  최초 문맥 구성, capability·schema 일치, Ask read-only 분리.
- PAH-2 `feat(pah-2)`: `resource-inventory.ts`, `resource-reader.ts`.
  inventory pagination, 동의 게이트 chunk 읽기, 마스킹, STALE/UNSUPPORTED.
- PAH-3 `feat(pah-3)`: `read-loop.ts`, `plan-contract.ts`.
  반복 읽기 루프, turn 분류·결속·배치, submit_plan 계약, budget→INCOMPLETE.
- PAH-4 `feat(pah-4)`: `component-descriptor.ts`, `component-facade.ts`.
  descriptor coverage, 모델 채널 선택, 가상 스크롤·차트 추정 한계.
- PAH-5 `feat(pah-5)`: `workflow-review.ts`.
  세 출처 검토, 무관 선택 재검토, page-generated 초안 분리. 예제 HTML·전용
  선언은 미변경 (전환은 읽기·검토·계획 구현과 같은 범위로 별도 진행).
- PAH-6 `feat(pah-6)`: `approval-store.ts`, `outcome.ts`.
  승인 결속·단일 사용 nonce, answer/action/goal 분리, legacy 매핑은 내부 제안.
- PAH-7 `feat(pah-7)`: `recovery.ts`, `diagnostics.ts`.
  fault별 재개 분리, 압축 경계 보존, 실패 분류 진단 (원문 비저장).
- PAH-8 `feat(pah-8)`: `verification-matrix.ts`.
  12 시나리오 집계 (overall/live 미마킹 금지), holdout 제네릭 스모크,
  release gate 분리 보고. live·holdout Chrome은 미검증.

## 다음 진입 조건

- live Provider + 실제 Chrome 검증 환경이 준비되면 PAH-3~8의 live 열을
  실행하고, holdout 페이지에서 일반 경로 자동 선택 없이 측정한다.
- 공유 계약 변경이 필요해지면 workspace contract-first 순서를 선행한다.
- 기존 문서 동기화는 사용자 확인 후 D01~D29/C01~C13 순서로 진행한다.

## P1/P2 후속 수정 기록 (2026-10-05)

- P1 진입점 연결: 신규 `page-act-harness/act-entry-bridge.ts`를
  `service-worker/act-chat-start.ts`(envelope 구성·검증·attach, best-effort +
  trace)와 `service-worker/act-step-runner.ts`(선언⊆제공 검사, entry·fresh
  교집합에서만 generic 경로 loud-fail `HARNESS_TOOL_NARROWING`)에 연결.
  에러 코드 1종을 공유 계약에 추가 (`core-types.ts`, `error-codes.ts`,
  `sidepanel/panel.ts` 문구). workflow 경로 좁힘은 trace만 남기고 PAH-5
  재검토 경로가 소유한다.
- P1 마스킹 우회: full-body 줄 분류 후 chunk 절단 (`resource-reader.ts`),
  값 분리줄 규칙 + search 발췌의 전체 분류 (`resource-inventory.ts`).
- P1 component 마스킹: `maskComponentRows` 실제 검사 (민감 키·대입값·bearer·
  secret query), 정직한 counts.
- P2 component offset: `offset` 윈도우 전진 + `offset:endPos` cursor.
  `offset > rows.length`는 `INVALID_OFFSET`.
- P2 approval: `createApprovalStore` 저장 레코드 기준 check-and-set
  (`APPROVAL_REUSED`/`APPROVAL_ID_CONFLICT`/`APPROVAL_NOT_FOUND`).
- P2 needs_context: `NEEDS_CONTEXT_WITHOUT_MISSING` 거부 제거, LLM 판단
  복귀 (+ 빈 missing trace alert).
- P2 중복 tool-call ID: turn내 Set 검사 + 원자적 커밋.
- 검증: `typecheck`·`lint`·`build`·`test:unit`(549 PASS)·`test:fixture`·
  `test:e2e`·module-boundaries(262 files)·method-trace-coverage PASS.
  live Provider + Chrome은 여전히 미검증.
