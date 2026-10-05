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

## 재검증 지적 R1/R2/R3 후속 구현 (2026-10-05)

기준: `docs/evidence/pah-review-reverification-2026-10-05.md` §3~§5, §8.

- R2 컴포넌트 마스킹 (`component-facade.ts`): 민감 키의 하위 전체를
  값 타입과 무관하게 redact (배열·객체·scalar, count 1), query·fragment를
  파라미터 단위로 redact (정상 파라미터·경로·구조 보존), Bearer 전역 치환
  (개수만큼 count). 대입값은 길이·숫자 포함 조건으로 benign 라벨 통과.
- R3 pagination (`component-facade.ts`): per-call 200 cap과 종료 판정 분리.
  종료는 남은 행·EOF로만 판정하므로 기본/명시 옵션이 마지막 페이지에서
  동일하게 complete. 정확히 끝점의 빈 읽기는 complete, 초과 offset은
  `INVALID_OFFSET`.
- R1 실행 연결:
  - `service-worker/act-harness-turns.ts` (신규): Ask 읽기 schema 재사용,
    요청 revision 결속 읽기 루프 (결속 검증·순차 배치·budget 소진 loud),
    `submit_review` 구조화 검토 턴, workflow 재검토 게이트, 첫 payload
    harness block.
  - `act-step-runner.ts`: generic 경로 첫 payload에 harness block +
    실제 읽기 도구 제공·루프 실행, workflow `PENDING_REVIEW` 세션의
    검토 게이트 (match/partial만 진행, mismatch/needs_context는
    clarification으로 mutation 없이 종료), answer 분기 결과 분리 기록.
  - `workflow-session-actions.ts`: 선택 시 harnessReview/provenance/
    capabilities 전파, dismiss 시 generic 선언 전파.
  - 승인 저장소: 게이트에서 grant·consume을 유효 revision으로 원자 수행
    (선택 시점 grant의 generation drift 결함을 제거). 싱글톤은 worker
    재시작 시 소멸한다.
  - `runtime-chat.ts`: `readAssist` 제공 (chrome API 존재 시).
  - 테스트 더블 진화: `scripts/chrome-accessible-items-smoke.mjs`의
    controlled provider가 review 턴에 `submit_review`로 답한다
    (case 적합 시 match, 강제 무관 선택 시 mismatch).
- 검증: `typecheck`·`lint`·`build`·`test:unit`(563 PASS)·`test:fixture`·
  `test:e2e`·module-boundaries(263 files)·method-trace-coverage PASS.
- 실제 Chrome (격리 프로필·통제 Provider·0.1.90 artifact):
  - 일반 Search 입력 PASS (읽기 루프·harness block 동작 중 입력 수행).
  - 정당 Preview 선택 PASS (match 검토 후 3단계 실행, Preview 생성).
  - 강제 무관 선택 (/tmp 변형): `submit_review:mismatch` 1회 후
    propose\_\* 0회, 페이지 무변화 (scope/checkbox/click 미실행).
  - accessible 전체 20/20 PASS.
- 실행 번들 의존성: 5개 진입점 그래프 242개 중 harness 8개
  (contracts, bootstrap-composer, capability-check, act-entry-bridge,
  approval-store, outcome, read-loop, workflow-review).
  미포함 모듈과 사유: resource-inventory/reader, component-\*
  (content-script fetch·collection-reader 배선이 필요한 product 작업으로
  별도 범위), plan-contract/recovery/diagnostics/verification-matrix
  (런타임 실행 경로가 아닌 검증·운영 모듈).
- 잔여: live Provider·실제 모델 추론, Platform/workspace 통합,
  inventory/component 읽기 도구의 Act 루프 편입, 기존 ACT_APPROVE
  실행 경로의 저장소 승인 교체 (현 구현은 검토 게이트 승인만 연결),
  기존 문서 동기화 (사용자 확인 후).

## 재검증 후속 2차 구현 (2026-10-05)

- generation 0 정규화 (`toHarnessRevision`): 제품 요청은 generation 0에서
  시작하고 harness revision은 1부터 시작한다. 경계 5곳 (chat-start attach,
  step-runner 게이트·루프·narrow 검사, selection 전파 2곳)과 루프·게이트
  진입점에서 정규화해 grant/consume/record가 desync되지 않는다. 실제
  Chrome에서 generation 0 워크플로우가 match 검토 후 진행됨을 확인.
- 검토 게이트 강화: `recorded` 실패·`executable:false`는 진행 불가
  (REVIEW_NOT_EXECUTABLE clarification), 턴 내 중복 `submit_review`는
  needs_context, 승인 소비 전 취소 확인, 전체 step tool 요약 포함.
- 컴포넌트 마스킹 정밀화: OAuth 불투명 키, schemeless query, 단문 기계형
  대입값 redact, benign 라벨 통과, URL은 파라미터 단위 우선.
- 읽기 루프·게이트 주석 정직화 및 좁힘 검사 선언 우선화.
- 테스트 더블: `notes` 케이스에 readFirst 턴을 추가해 generic 읽기 루프
  (읽기→결과→제안→실행)를 Chrome에서 커버.
- 검증: `typecheck`·`lint`·`build`·`test:unit`(568 PASS)·`test:fixture`·
  `test:e2e`·module-boundaries(263 files)·method-trace-coverage PASS.
- 실제 Chrome: accessible 전체 20/20 PASS (notes readFirst 포함),
  정당 Preview match 후 3단계 실행, 강제 무관 선택 mismatch 후
  propose 0회·페이지 무변화.

## 재검증 후속 3차 구현 (2026-10-05, 최종 리뷰 반영)

- revision 매핑을 단조 증가로 변경 (`toHarnessRevision`: g → g+1).
  0/1 붕괴가 첫 drift 탐지를 무력화한다는 지적 반영. 모든 경계가 동일
  helper를 사용하므로 grant/consume/record/narrow 동등성은 유지.
- 게이트 binding 신선도: 승인 소비 직전 `refreshBinding` (스냅샷 재읽기,
  epoch·origin 대조)으로 stale 진행 차단. 취소 중 read 루프는
  clarification으로 수렴 (POLICY_DENIED 구분).
- 마스킹 순서: Bearer 전역 치환 후 URL 파라미터 단위 마스킹으로
  혼합 문자열 누출 제거. `CREDENTIAL_LIKE` 별칭 제거.
- 소진된 읽기 루프의 answer 승격 시 `exhausted_answer` trace 병기.
- 선언 능력 우선: 제공 읽기 도구는 선언 목록과의 교집합으로만 제공.
- 테스트 더블(`notes.readFirst`)로 generic 읽기 루프를 Chrome에서 커버.
- 검증: `typecheck`·`lint`·`build`·`test:unit`(569 PASS)·`test:fixture`·
  `test:e2e`·module-boundaries(263 files)·method-trace-coverage PASS.
- 실제 Chrome: accessible 20/20 PASS 2회 (notes readFirst 포함),
  정당 Preview 3단계 실행 3회 확인, 강제 무관 선택 mismatch 후
  propose 0회·페이지 무변화 (통제 provider 응답 로그 + 상태 확인).
- 플레이크 관찰: 전체 스위트 5회 중 2회 단일 케이스 실패
  (workflow 1회 — generation 0 결함 수정 전, reviewed 1회 —
  원인 미확정 UI 타이밍 의심, 단독·페어 재실행 PASS). 릴리스 게이트용
  반복 실행·원인 추적을 별도 작업으로 권장.

## 재검증 문서 F1–F5 구현 (2026-10-05)

기준: `pah-review-reverification-de00af6d4-2026-10-05.md` §3–§5, §8.

- F1 [P1] partial 실행 차단: 게이트에서 `match`만 진행하고 `partial`은
  mismatch와 같은 clarification 종료로 전환 (mutation 0, 원본 불변,
  subset 선택 없음). 변경안 확인은 사용자의 새 요청 revision으로 받고,
  승인된 revision과 실행 내용이 일치할 때만 실행한다.
- F2 [P1] 검토 payload: 전체 step의 대상·순서·분기 조건을 bounded 요약으로
  전달하고 request_revision 결속 근거를 포함한다. 읽지 않은 정의는 근거가
  될 수 없다는 지침을 검토 prompt에 추가했다.
- F3 [P1] percent-encoded 키: 검사 전용으로 최대 3회 디코딩해 검사하고,
  디코딩 실패·인코딩 잔류는 명시적으로 redact한다. 출력은 raw 표기를
  유지한 채 값만 절단한다.
- F4 [P2] revision 단일 경계: 원시 product generation 진입 시 1회만
  `toHarnessRevision`으로 변환하고, 저장된 harness revision은 직접
  비교한다. 동일 generation 생성 capability의 stale 오인 해소와 실제
  변경 감지를 함께 검증한다.
- F5 [P2] budget 소진: `INCOMPLETE` 상태 + `UNKNOWN`/`CONTEXT_BUDGET_EXCEEDED`
  터미널로 기록하고, 원인·읽기 횟수·계속 방법을 사용자에게 전달한다.
  `VERIFIED` 성공으로의 승격을 제거했다.
- 검증: `typecheck`·`lint`·`build`·`test:unit`(575 PASS)·`test:fixture`·
  `test:e2e`·module-boundaries(263 files)·method-trace-coverage PASS.
- 실제 Chrome (격리 프로필·통제 Provider·0.1.90 artifact):
  - search/notes/workflow targeted PASS (notes readFirst 루프 포함).
  - accessible 전체 20/20 PASS.
  - 강제 무관 선택 mismatch: `submit_review:mismatch` 1회 후 propose 0회,
    페이지 무변화.
  - 강제 무관 선택 partial: `submit_review:partial` 1회 후 propose 0회,
    페이지 무변화 (F1 종료 기준 충족).
- 잔여: live Provider·실제 모델 추론, Platform/workspace 통합,
  inventory/component 읽기 도구의 Act 루프 편입, 기존 ACT_APPROVE
  실행 경로의 저장소 승인 교체, 기존 문서 동기화 (사용자 확인 후).

## F1–F5 종료 기준 재검증 하드닝 (2026-10-05)

- F3 확장: percent-encoded 검사가 component 경로에만 있어 동일 우회가
  source chunk·검색 발췌 경로에 잔존함을 확인. `decodeQueryPart`를
  `resource-inventory.ts`로 이동해 양 경로가 단일 검사 로직을 공유하고,
  `classifySensitiveLines`가 인코딩된 키워드 줄과 다음 줄 값을 함께
  가린다. chunk·검색 단위 테스트 추가 (인코딩 키·디코딩 실패·benign 보존).
- F1 runner partial 테스트 추가 (문서 repro 그대로: Search 요청 +
  Preview 선택 + partial → CLARIFICATION, dispatch 없음).
- F2 구별 가능성 테스트 추가 (동일 ID·title·도구명, 대상만 다른 두 선언의
  검토 payload가 다르고 각 대상을 요약에 포함).
- F4 narrowing 테스트를 실제 생성값(`request_revision: 1`)으로 정규화.
- 게이트 dead `note` 필드 제거 및 stale 주석 정정.
- 검증: `typecheck`·`lint`·`build`·`test:unit`(579 PASS)·`test:fixture`·
  `test:e2e`·module-boundaries(263 files)·method-trace-coverage PASS.
- 실제 Chrome: targeted 3건 PASS, 강제 mismatch/partial 모두 review
  1회 후 propose 0회·페이지 무변화, 전체 20/20 PASS 2회.
  동일 빌드에서 17/20 1회 발생 (workflow+menu+reviewed 동시 실패,
  전후 동일 조건 재실행 PASS) — 제품 코드 변경 없이 해소되어 환경
  플레이크로 기록. 릴리스 게이트용 반복 실행·원인 추적은 별도 작업으로
  권장 (기존 플레이크 관찰과 동일).
