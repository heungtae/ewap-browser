# S10-R — Browser Page API 취소·요청 바인딩 보강

> 개발·검증 이력이다. 본문의 계획·상태는 기록 당시 범위이며 현재 동작은
> [코드 탐색 안내](../source-guide.md)와 해당 revision의 실행 결과로 확인한다.

## 상태와 우선순위

**Completed — 2026-10-01. Browser 로컬 fixture 범위.** 기존 Browser
[S10-C1~C5](s10-page-api-discovery-handoff.md)의 리뷰 후속 스프린트다.
Enterprise S10 Profile 수락과 별도이며, S13 분석 연결이나 S15 배포를
선행 조건으로 요구하지 않는다. 구현과 검증은 [S10-R 증거](../evidence/s10-r-request-cancellation-2026-10-01.md)에 기록했다.

## 문제와 재현 근거

리뷰 대상 커밋은 `825aa4cd0693546a85e464a7b3e7fce871c60e58`이다.
`page-api-runner.ts`가 MAIN probe를 기다리는 동안 Stop으로 요청을 종료해도
runner는 문서·page scope만 다시 검사한다. 실제
`RequestExecution.beforeDispatch(tabId)`는 활성 요청이 없으면 반환하고,
같은 탭에 새 요청이 있으면 그 요청에 dispatch 표시를 기록한다.

프로덕션 `createPageApiRunner`와 `ChatRequestLifecycle`을 함께 사용하고
scripting 응답을 지연한 로컬 재현에서 다음 결과를 확인했다.

- 원래 요청은 `TERMINAL/CANCELLED`인데 probe 응답을 풀면 변경 injection이 1회 실행되고 runner는 `VERIFIED`를 반환했다.
- 취소 후 같은 탭에 새 Ask 요청을 시작하면 이전 runner가 새 요청을 `DISPATCH`, `dispatch_started=true`로 변경했다.
- 관련 단위 테스트 4개 파일/59건은 통과했다. 기존 Chrome Stop 증거는 dispatch 이후 취소이며, probe 대기 중 취소를 입증하지 않는다.

이 재현은 실제 lifecycle과 runner의 조합에 대한 증거다. 실제 Chrome에서
dispatch 전 Stop을 검증하는 증거는 S10-R에서 추가한다.

## 수정 계약

1. Page API 실행 시작 시 원래 `RequestContext`, request ID와 generation에
   해당하는 실행 유효성, run ID, tab ID를 고정한다. 진행 중인 작업을
   `activeContext(tabId)`로 새 요청에 재결속하지 않는다.
2. probe, 사전 observation, dispatch marker 저장 등 각 비동기 단계 직후와
   MAIN 변경 호출 직전에 원래 요청의 취소·terminal·소유권을 재검사한다.
   문서·page scope 검사도 함께 유지한다. 사전 관찰이 satisfied여도 취소된
   요청을 `ALREADY_SATISFIED`나 `VERIFIED`로 되살리지 않는다.
3. dispatch hook은 고정한 요청을 지정해 marker를 기록한다. 요청 부재,
   terminal, generation/소유권 불일치는 차단한다. marker 저장을 기다리는
   동안 Stop이나 새 요청 시작이 발생하면 저장 이후에도 재검사해 호출을 막는다.
4. 변경 호출 전 취소는 호출 0건과 기존 취소 terminal을 유지한다. 호출이
   시작된 뒤에는 페이지가 늦게 완료될 수 있으므로 요청 결과를 `UNKNOWN`으로
   유지하고 재시도하지 않는다. 오래된 작업의 progress·marker·terminal이
   같은 탭의 새 요청을 변경하지 않게 한다.
5. 원래 요청의 terminal·permission cleanup과 Worker 복구 계약을 유지한다.
   기존 DOM/CDP dispatch hook 호출자를 확인하고, 공유 hook 변경으로 정상
   실행이나 navigation 검증이 달라지지 않도록 회귀 검증한다.

## 구현 카드와 순서

| 카드 | 수정 대상과 산출물 | 종료 조건 |
| --- | --- | --- |
| S10-R-C1 | `request-execution.ts`, `runtime-execution.ts`, `runtime-chat.ts`: 원래 요청에 결속된 dispatch hook·유효성 전달 | terminal/부재/다른 요청은 marker를 기록하지 않고 차단. marker 저장 후에도 원래 요청 확인 |
| S10-R-C2 | `page-api-runner.ts`: 비동기 단계와 MAIN dispatch 직전 취소 검사 | probe/observation/marker 대기 중 Stop 이후 변경 호출 0건. 새 요청에 재결속 없음 |
| S10-R-C3 | runner와 실제 `ChatRequestLifecycle`을 결합한 회귀 테스트 | 아래 R-01~R-07을 지연 Promise·제어된 순서로 재현하고 검증 |
| S10-R-C4 | 실제 Side Panel/Chrome S10 fixture 보강 | dispatch 전 Stop과 같은 탭 새 요청 시작을 실제 production 경로에서 확인 |
| S10-R-C5 | 검증 증거·S10 관련 문서·진행 원장 정리 | 새 증거를 연결하고 S10-R을 Completed로 판정. 기존 증거의 검증 범위를 유지 |

## 검증 행렬

| ID | 시나리오 | 기대 결과 |
| --- | --- | --- |
| R-01 | MAIN probe 대기 중 Stop, 이후 probe 완료 | 변경 호출 0건. 기존 CANCELLED terminal 유지 |
| R-02 | 사전 observation 대기 중 Stop, 이후 pending 또는 satisfied 반환 | 변경 호출 0건. VERIFIED/ALREADY_SATISFIED로 복귀하지 않음 |
| R-03 | dispatch marker 저장 대기 중 Stop, 이후 저장 완료 | MAIN 변경 호출 0건. 취소 이후 단계가 원래 요청을 재개하지 않음 |
| R-04 | R-01/R-02 취소 후 같은 탭에서 새 Ask/Act 요청 시작 | 이전 호출 0건. 새 요청에 이전 작업의 marker/progress/terminal이 기록되지 않음 |
| R-05 | 요청 ID/generation 불일치, terminal/부재, navigation·문서/page scope 변경 | 변경 호출과 다른 요청의 marker 기록 모두 0건 |
| R-06 | 실제 변경 호출 이후 Stop, 늦은 페이지 완료·Worker 재시작 | UNKNOWN 유지. 재호출 없음. 같은 탭 새 요청의 상태 보존 |
| R-07 | 정상 승인·권한, already-satisfied, 동시 중복 승인, throw/timeout | 기존 VERIFIED/ALREADY_SATISFIED/UNKNOWN 및 중복 호출 차단 유지 |

R-01~R-07은 결합 단위 검증을 요구한다. Chrome에서는 최소 R-01, R-04,
R-06, 정상 승인·권한 경로를 실제 UI로 검증한다. 지연과 호출 횟수 관찰은
격리 fixture/harness에서 제어하며 제품 runtime message나 모델 tool에
테스트용 실행 경로를 추가하지 않는다.

## 완료 조건

- 재현한 P1 두 경로에서 변경 호출이 0건이며 새 요청 상태가 오염되지 않는다.
- request ID/generation에 결속된 검증이 marker 저장 전후와 MAIN 변경 호출 직전에 적용된다.
- 단위 테스트, typecheck, lint, 버전 보존 extension build, package·module boundary 검사가 통과한다.
- 실제 Chrome S10/Discovery, 기존 preview와 S7 DOM/CDP Act 회귀를 확인한다.
- 실행 명령·환경·호출 횟수·terminal 상태를 증거 문서에 기록하고 진행 원장에 연결한다.

## 관련 문서

- [Sprint 진행 상태](../sprint-progress.md)
- [기존 S10 검증 증거](../evidence/s10-page-api-closure-2026-10-01.md)
- [Page API 실행 설계](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/27-page-api-execution-design.md)
- [Act 요청 처리 현재 구현 경로](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/31-act-request-execution-current-implementation.md)

## 구현 결과

C1~C5 완료. session의 원래 RequestContext를 snapshot 읽기 전부터 고정하고, generation·owner·store 객체·abort·terminal과 문서/page scope를 재검사한다. marker 저장 전후 검사 및 요청 ID/generation 기반 cleanup으로 같은 탭의 후속 요청을 보호한다. marker 저장이 이미 시작된 뒤 Stop은 보수적으로 UNKNOWN을 유지하며 MAIN 호출은 0건이다. Chat 요청이 없는 기존 START_ACT는 기존 DOM/CDP 경로를 유지한다.
