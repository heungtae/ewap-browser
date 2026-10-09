# Browser Act S17 — 계획 제출과 실행 결과의 LLM 피드백

## 상태와 진입 조건

**In Progress — 2026-10-09.** 의존성: [S16](s16-page-script-tool-loop.md)의 registry·결과 반환,
[S15 / PAH-9](s15-pah-9-llm-input-value-binding.md)의 입력값·질문 계약.
기준은 [34번 설계](../34-page-act-context-harness-design.md)의 6.2·9·16.5절이다.
Browser-local 계획이며 기존 Enterprise 배포 Sprint와 구분한다.

C1~C6의 Browser-local 구현과 계약/통제 Chrome 검증을 연결했다.
`submit_plan`은 실제 계획 카드에서 승인받고, 기존 동작별 승인과 권한 검사를 유지한다.
DOM·Page API·workflow 마지막 단계·승인된 같은 origin 이동 결과를 최신 관찰과 함께
같은 conversation에 반환한다. 안전한 후속 관찰이 불가능하면 UNKNOWN이다.
단순 동작 성공과 모델 목표 판단을 분리하며 기존 terminal wire는 유지한다.
지정 모델의 live 경로는 미통과이며 마지막 호출은 무료 모델 일일 한도 HTTP 429다.
통제 PASS만으로 Completed로 변경하지 않는다.
[실행 방법](../test.md#s17-계획실행-결과-피드백-테스트)과
[구현·검증 증거](../evidence/s17-plan-feedback-2026-10-09.md)를 따른다.

## 목표와 경계

LLM이 근거로 계획을 제출하고, 승인된 실행 결과와 최신 관찰을 받아 목표 완료·추가
읽기·재계획을 판단한다. script에서 함수를 발견한 사실과 실행 가능한 수단을 구분한다.
임의 JS 실행이나 발견한 함수/endpoint의 자동 등록은 범위에 포함하지 않는다.

## 구현 카드와 순서

| 카드   | 수정 영역과 산출물                                         | 종료 조건                                                                                  |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| S17-C1 | submit_plan tool/schema·plan store·revision·기술 오류 반환 | 목표/evidence/steps/입력/부작용/postcondition을 제출. 호출만으로 승인/실행 없음            |
| S17-C2 | UI·등록 Page API/reviewed reader 실행 수단 inventory       | action 설명·입력/결과 schema·허용 옵션·권한·side effect·지원 상태를 모델에 제공            |
| S17-C3 | 계획/대상/값 revision과 기존 승인·permission·executor 결속 | 변경된 계획·값·대상에 예전 승인을 재사용하지 않음                                          |
| S17-C4 | completion/workflow/step messages의 관찰·결과 continuation | 일반 DOM·Page API·workflow 마지막 단계 결과를 모델에 반환. 이전 근거 보존                  |
| S17-C5 | 승인된 navigation과 비동기 결과의 후속 관찰                | 새 binding/권한 검사, bounded verifier 결과/timeout을 모델에 반환. 안전한 관찰 불가는 명시 |
| S17-C6 | typed action verifier와 LLM 목표 판단의 종료 계약·호환성   | ANSWER_ONLY/action VERIFIED/goal 완료/FAILED/UNKNOWN/INCOMPLETE를 근거로 구분              |

주요 연결 지점은 page-act-harness/plan-contract.ts, approval-store.ts, outcome.ts,
service-worker/act-proposal-completion.ts, act-step-runner.ts, act-step-messages.ts와
기존 Page API registry/executor/postcondition verifier다. 기존 adapter가 지원하지 않는
함수 인자·반환값은 metadata에서 미지원으로 표시하며 계약을 추측 확대하지 않는다.

## 검증 행렬

| ID     | 시나리오                                         | 기대 결과                                                                                     |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| S17-R1 | script에서 필요한 동작을 발견하고 UI/API 선택    | LLM이 실제 지원 수단을 선택. 미등록 함수는 호출 0건과 지원 불가 설명                          |
| S17-R2 | 명확한 값의 계획 승인·사용자 정정·계획 변경      | 승인된 최신 대상/값만 적용. 추가 질문 여부는 LLM 판단                                         |
| S17-R3 | 여러 단계 실행·workflow 마지막 단계              | 단계별 실제 결과·관찰을 모델이 받고 목표 완료 또는 후속 작업 판단                             |
| S17-R4 | 등록 Page API 성공·실패·UNKNOWN                  | tool 결과가 대화에 연결. typed 실패/UNKNOWN을 설명만으로 성공 처리하지 않음                   |
| S17-R5 | 승인된 navigation·새 origin·탭 변화              | 이전 ref/cursor/승인 폐기. 정책에 맞는 최신 관찰 또는 명시적 UNKNOWN/UNSUPPORTED              |
| S17-R6 | 비동기 UI·관찰 timeout·already satisfied         | bounded 관찰·실제 verifier evidence를 전달. 미관찰 성공과 중복 실행 없음                      |
| S17-R7 | unsupported step·schema 오류·Stop·worker restart | 모델에 보완 가능한 오류 반환 또는 terminal. step 삭제로 위장 성공·미확인 mutation 재시도 없음 |

## 완료 조건과 산출물

- 계획·실행 수단·승인·결과가 같은 request revision의 근거로 연결된다.
- 성공한 단일 실행을 전체 사용자 목표 완료로 자동 승격하지 않는다.
- Page API/navigation/workflow 종료도 실제 관찰을 바탕으로 LLM 목표 점검을 수행한다.
- 결과를 반환할 수 없는 경로와 지원하지 않는 기능을 실제 capability에 표시한다.
- storage/audit/outcome 호환성을 검증하고 외부 wire 변경은 contract-first로 처리한다.
- 계약/unit·관련 build/회귀와 통제 Chrome/live Provider 결과를 각각 evidence에 기록한다.

다음 단계는 [S18](s18-workflow-resource-tools.md)이다. 이 계획에는 제품 배포나
Platform 활성화 완료를 포함하지 않는다.
