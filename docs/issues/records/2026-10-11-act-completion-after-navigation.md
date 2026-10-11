# ISS-20261011-001: 이동 성공 후 최종 확인에서 오류 표시

## 현재 상태 — 완료

2026-10-11 사용자의 “모두 완료 처리해” 요청에 따라 이슈 추적을 종료했다.
아래의 검증 중·재검증 필요 표현과 미체크 완료 조건은 완료 처리 이전의 이력이다.
실제 사이트·Provider·사용자 설치·배포 및 기존 미확인 조건을 새로 검증했다는 의미는 아니다.
기존 수정·검증 기록은 보존하며, 같은 문제가 재발하면 이 ID를 다시 연다.

## 관리 정보

| 항목                  | 값                                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 상태                  | 완료 (사용자 요청에 따른 추적 종료)                                                                                                 |
| 발생일·최근 갱신      | 2026-10-11 KST                                                                                                                      |
| 영향 범위             | Act 이동 후 목표 판단, 요청 상태·Side Panel 표시                                                                                    |
| 발생 버전             | 진단 번들의 extension version `0.1.99`                                                                                              |
| 발생 source revision  | 번들에 commit 정보가 없어 미확인                                                                                                    |
| 분석 source revision  | `549ebacc76b5608d80ca70ab71610da11bbc29f0` 및 로컬 버전 메타데이터 변경                                                             |
| 관련 이슈             | [ISS-20260916-001](../2026-09-16-navigation-snapshot-verification.md), [ISS-20260916-002](../2026-09-16-variant-menu-navigation.md) |
| 수정 commit·배포 버전 | 로컬 구현 완료·미커밋·미배포                                                                                                        |
| 다음 작업             | 없음 — 사용자 요청으로 추적 종료                                                                                                    |

이 문서는 발생 당시 진단과 수정·검증 이력을 기록한다. 현재 구현은 링크한 코드와 계약에서
확인한다. 구현 진행 시 변경 결과·테스트·증거와 [목록](../README.md)을 함께 갱신한다.

2026-10-11: [Browser Act S21](../../sprints/s21-act-evidence-based-llm-assessment.md)의
C4~C8/R9에서 기존 action/goal 분리·freshness·bounded 재확인 회귀를 유지하고,
action 완료까지의 현재 데이터 기반 LLM 판단을 확장할 계획이다. 이 이슈의 기존 구현과
검증 이력은 보존하며 원래 사이트·live Provider 재확인 상태는 그대로 `검증 중`이다.

## 증상과 발생 증거

비용 화면으로 정상 이동했지만 마지막에 오류가 표시됐다. 진단 파일은
`contextpilot-diagnostics-2026-10-10T21-40-25-e0134db6-ec1b-4403-a099-aeaee31c0106.zip`이며
요청 ID는 `e0134db6-ec1b-4403-a099-aeaee31c0106`이다. 파일명의 시각은 UTC이고 아래
발생 시각은 KST다. 원본 ZIP은 로컬 Downloads에 있으며 저장소에 포함하지 않는다.

| 시각         | 요청 후 경과 | 진단 근거                                                              |
| ------------ | ------------ | ---------------------------------------------------------------------- |
| 06:40:02.145 | 11.927초     | sequence 70: `SNAPSHOT_VALIDATED`                                      |
| 06:40:02.146 | 11.928초     | sequence 71: `COMPLETION_VERIFIED`, 이동 결과 `VERIFIED`               |
| 06:40:04.039 | 13.821초     | sequence 76: 이동 후 `CONTACTING_PROVIDER`                             |
| 06:40:09.593 | 19.375초     | method sequence 256852: `act.goal.feedback`, `UNKNOWN / STALE_BINDING` |
| 06:40:09.654 | 19.437초     | sequence 85: 요청 terminal `UNKNOWN`, 구체적 code 없음                 |

LLM에 제공한 관찰은 node count 93, visible text 길이 315였다. 응답 후 재검사는
node count 121, visible text 길이 520으로 바뀌었고 플랜·가격 화면의 표시 근거가
나타났다. 실행 근거는 1건 모두 `satisfied / VERIFIED`였고 LLM의 목표 보고는
`incomplete`였다. 원문 tool arguments는 마스킹되어 있어 모델의 설명은 확인하지 않았다.

변화한 화면 내용만으로도 기존 전체 snapshot digest와 불일치한다. 마스킹된
origin·document epoch의 실제 값은 ZIP만으로 비교할 수 없다. 따라서 추가 binding
변화의 유무와 사이트 내부 렌더링 원인은 확정하지 않는다.

## 분석 revision에서 확인된 원인과 코드 위치

1. [이동 verifier](../../../extension/src/service-worker/act-postcondition-verifier.ts)는
   새 scope/document의 등록된 비어 있지 않은 snapshot을 얻으면 이동을 검증한다.
   목적지의 후속 렌더링이 계속될 수 있다.
2. [관찰 digest 생성](../../../extension/src/service-worker/act-step-runner.ts)과
   [최종 목표 검증](../../../extension/src/service-worker/act-goal-feedback.ts)은
   LLM 판단 전후의 전체 snapshot digest 일치를 요구한다. 불일치하면
   [outcome 분류](../../../extension/src/page-act-harness/outcome.ts)가
   `UNKNOWN / STALE_BINDING`을 반환하고 최신 관찰로 재판단하지 않는다.
3. 최종 목표 검증은 `STALE_BINDING`을 request/chat의 구체적 code로 전달하지 않는다.
   [Panel entry](../../../extension/src/sidepanel/entry.ts)는 code 없는 `UNKNOWN`을
   `INTERNAL_FAILURE`로 처리한다. 이번 패널 기록에는 해당 오류가 2회 남았다.

ISS-20260916-001은 이동 단계에서 fresh snapshot을 검증하지 못한 과거 문제다.
이번에는 이동 검증 이후 목표 판단에서 실패했으므로 동일 원인으로 합치지 않는다.

## 해결안과 진행 항목

### P1. 실행 결과와 목표 결과 분리 — 구현 완료

- [x] 검증된 action 결과·근거를 보존하고 goal의 `확인 중 / 완료 / 미완료 / 미확인`을
      별도로 관리한다. 후속 관찰 변경은 이미 검증된 action의 이력을 덮어쓰지 않는다.
- [x] 최종 판단의 reason과 사용자 표시 상태를 요청 조회·chat event·저장·진단까지
      전달한다. 기존 `outcome`의 호환성을 유지하며 추가 필드는 validator와 복구 경로도
      함께 갱신한다. 실제 wire 계약은 [ActCompletion](../../../extension/src/contracts/act-completion.ts)에서 확인한다.
- [x] 단계 완료는 tool 결과로 전달하고 전체 요청 종료는 최종 판단에서 처리하도록
      [proposal completion](../../../extension/src/service-worker/act-proposal-completion.ts)의
      terminal 발행과 후속 run 시작을 정리한다. 중간 성공과 최종 종료가 혼동되지 않아야 한다.

### P2. action별 완료 조건 적용 — 구현 완료

[CompletionContract](../../../extension/src/contracts/action-types.ts)를 출발점으로
실제 verifier와의 연결을 확인하고 보강한다. 타입에 정의된 조건만으로 runtime 지원을
확정하지 않는다. marker는 실제 관찰이나 검토된 profile/adapter 근거로 확보한다.

| action             | 완료 판단 근거                                                |
| ------------------ | ------------------------------------------------------------- |
| 이동               | 목적지·scope 도달, 새 화면 등록, 확보된 목적지 표시 요소      |
| 입력·선택          | 대상 컨트롤의 실제 값·선택 상태 일치; 민감값 비교는 로컬 처리 |
| 메뉴·대화상자 열기 | 요청한 UI·상태가 표시되고 사용 가능한지 확인                  |
| 저장·제출          | 해당 실행에 연결된 저장 상태·결과 또는 authoritative receipt  |

- [x] 단순 작업의 완료 조건이 원래 사용자 목표를 직접 충족하면 로컬 근거로 목표를
      확인한다. 중간 메뉴 열기·중간 이동은 전체 목표 완료로 승격하지 않는다.
- [x] 복합 목표는 검증된 실행 결과와 최신 관찰을 받은 LLM 판단을 추가한다. LLM의
      완료 주장으로 typed failure나 미검증 mutation 결과를 덮어쓰지 않는다.
- [x] DOM 안정·URL 변경·일반 성공 알림만으로 저장·업무 결과를 확정하지 않는다.

### P3. binding 검사와 완료 근거의 최신성 검사 분리 — 구현 완료

- [x] 탭·origin·문서·request generation·취소 상태는 엄격하게 검사한다. 검증된
      navigation의 허용된 재연결과 예상 밖 페이지 변경을 구분한다.
- [x] 완료 판단에 사용한 대상·결과 영역·표시 요소의 관련 근거를 비교한다. 배경
      알림 등 무관한 변화는 완료를 취소하지 않는다. 관련 영역을 신뢰성 있게 분리할
      수 없으면 최신 전체 관찰로 다시 판단한다.
- [x] 관련 근거 변경은 재관찰로 처리한다. DOM replacement에 따른 읽기용 재식별은
      기존 실행 대상·승인의 재사용 권한을 만들지 않는다.
- [x] 명시적 실행 실패는 관찰 freshness 오류보다 먼저 보존해 실제 실패가 가려지지
      않도록 outcome 우선순위를 검증한다.

### P4. 제한된 재관찰과 목표 재판단 — 구현 완료

- [x] `실행 → 관찰 → 완료 조건 확인 → 필요 시 LLM 판단 → 관련 근거 재검사`로 처리한다.
- [x] 렌더링 중이면 기존 시간 budget 안에서 관련 근거를 관찰한다. 초기 제안은
      200ms 간격 2~3회 관찰이며 안정 자체는 성공 근거가 아니다.
- [x] LLM 판단 도중 관련 근거가 바뀌면 이전 판단을 폐기하고 새 observation ID와
      최신 화면으로 다시 판단한다. 초기 재판단 상한은 2회이며 실제 검증으로 조정한다.
- [x] 재관찰은 기존 읽기 권한·consent 범위 안에서 수행하고 실행 횟수는 늘리지
      않는다. 저장·제출·이동 등 mutation을 자동 반복하지 않는다.
- [x] 전체 요청 deadline·provider 호출 상한을 유지한다. Stop·예상 밖 페이지 변경·
      worker restart 시 오래된 관찰·응답·승인을 폐기한다.

### P5. 사용자 표시와 진단 — 구현 완료

| 결과                             | 표시 예시                                         |
| -------------------------------- | ------------------------------------------------- |
| 목표 완료 확인                   | 비용 화면으로 이동했습니다.                       |
| 추가 렌더링 관찰 중              | 이동했습니다. 화면을 확인하고 있습니다.           |
| action 성공, 목표 확인 상한 도달 | 이동은 완료했습니다. 최종 화면 확인이 필요합니다. |
| 실제 action 실패                 | 구체적인 실패 원인과 확인 방법                    |

- [x] 관찰 제한·목표 미완료는 해당 상태와 사유로 표시하고 실제 내부 예외와 구분한다.
- [x] action 결과·goal 결과·reason·재관찰 횟수·budget 종료 사유를 안전한 진단 필드로
      전달한다. request 조회·실시간 event·Panel 재연결에서 같은 표시가 나와야 한다.
- [x] raw page/provider 내용·입력값·자격증명을 새 진단 필드에 넣지 않는다.

권장 구현 순서는 P1·P4·P5의 연결된 수정, 이어서 P2·P3의 완료 조건 강화다.

## 회귀 검증 목록

단위·통제 Chrome의 결과를 아래에 연결한다. PASS는 해당 통제 범위의 결과이며
실제 비용 사이트·live Provider의 성공을 의미하지 않는다.

| ID  | 조건                                                           | 기대 결과                                                          | 테스트·증거                                                                                                                                                                                                                                                                                                                                                                                                                          | 상태        |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| R01 | 이동 후 shell에서 비용 화면으로 지연 렌더링, LLM 중 관찰 변화  | 최신 관찰로 재판단해 목적지 근거 충족 시 완료; action 1회          | [act-goal-reassessment.test.ts](../../../extension/tests/unit/service-worker/act-goal-reassessment.test.ts); Chrome delayed-cost-screen                                                                                                                                                                                                                                                                                              | PASS (통제) |
| R02 | 배경 알림·무관한 영역만 변경                                   | 유효한 완료 근거 유지, 오류 표시 없음                              | [act-goal-observation.test.ts](../../../extension/tests/unit/service-worker/act-goal-observation.test.ts)                                                                                                                                                                                                                                                                                                                            | PASS (통제) |
| R03 | 목표 결과 영역 또는 관련 값 변경                               | 오래된 판단 폐기, 새 근거 확인 전 목표 완료 없음                   | [act-goal-observation.test.ts](../../../extension/tests/unit/service-worker/act-goal-observation.test.ts); [completion-region.test.ts](../../../extension/tests/unit/content/completion-region.test.ts)                                                                                                                                                                                                                              | PASS (통제) |
| R04 | 잘못된 목적지·marker 미출현·렌더링 계속됨                      | 상한 안에서 종료, 실제 사유와 미확인·미완료 표시                   | [act-navigation-marker.test.ts](../../../extension/tests/unit/service-worker/act-navigation-marker.test.ts); [act-goal-reassessment.test.ts](../../../extension/tests/unit/service-worker/act-goal-reassessment.test.ts)                                                                                                                                                                                                             | PASS (통제) |
| R05 | 중간 메뉴·중간 이동만 성공                                     | 해당 action 성공 유지, 전체 목표 완료로 승격하지 않음              | [act-goal-reassessment.test.ts](../../../extension/tests/unit/service-worker/act-goal-reassessment.test.ts); [act-local-goal.test.ts](../../../extension/tests/unit/service-worker/act-local-goal.test.ts)                                                                                                                                                                                                                           | PASS (통제) |
| R06 | 입력·선택과 DOM replacement                                    | 실제 결과 확인, 읽기 재식별과 실행 권한 구분                       | [act-postcondition-verifier.test.ts](../../../extension/tests/unit/service-worker/act-postcondition-verifier.test.ts); [act-goal-observation.test.ts](../../../extension/tests/unit/service-worker/act-goal-observation.test.ts); [completion-region.test.ts](../../../extension/tests/unit/content/completion-region.test.ts)                                                                                                       | PASS (통제) |
| R07 | 저장·제출 응답 불명 또는 이전 결과·toast 재사용                | 새 실행과 연결된 결과 없으면 성공 확정·자동 재실행 없음            | [act-result-generation.test.ts](../../../extension/tests/unit/service-worker/act-result-generation.test.ts); [content/ui-completion.test.ts](../../../extension/tests/unit/content/ui-completion.test.ts)                                                                                                                                                                                                                            | PASS (통제) |
| R08 | typed FAILED/UNKNOWN인데 모델이 완료 주장                      | 실제 실행 결과 보존, 거짓 성공 없음                                | [act-goal-reassessment.test.ts](../../../extension/tests/unit/service-worker/act-goal-reassessment.test.ts); [act-s17-feedback.test.ts](../../../extension/tests/unit/service-worker/act-s17-feedback.test.ts)                                                                                                                                                                                                                       | PASS (통제) |
| R09 | 재관찰 중 Stop·탭/origin 변경·예상 밖 문서 변경·worker restart | 오래된 응답·승인 폐기, 추가 mutation 없음                          | [act-goal-deadline.test.ts](../../../extension/tests/unit/service-worker/act-goal-deadline.test.ts); [act-goal-reassessment.test.ts](../../../extension/tests/unit/service-worker/act-goal-reassessment.test.ts); [act-completion-recovery.test.ts](../../../extension/tests/unit/service-worker/act-completion-recovery.test.ts); [request-recovery.test.ts](../../../extension/tests/unit/service-worker/request-recovery.test.ts) | PASS (통제) |
| R10 | 재판단 반복·provider 오류·deadline 소진                        | 호출·시간 상한 준수, action 성공 이력과 구체적 목표 확인 사유 유지 | [act-goal-deadline.test.ts](../../../extension/tests/unit/service-worker/act-goal-deadline.test.ts); [act-goal-reassessment.test.ts](../../../extension/tests/unit/service-worker/act-goal-reassessment.test.ts)                                                                                                                                                                                                                     | PASS (통제) |
| R11 | SPA scope 변경 후 snapshot 등록·같은 Panel 상태 조회           | scope 보존, fresh snapshot 확인, 정상 소유자의 조회 유지           | [act-postcondition-verifier.test.ts](../../../extension/tests/unit/service-worker/act-postcondition-verifier.test.ts); [request-recovery.test.ts](../../../extension/tests/unit/service-worker/request-recovery.test.ts); Chrome states-link                                                                                                                                                                                         | PASS (통제) |
| R12 | HTTP(S) anchor의 ARIA menuitem 선택                            | navigate 분류 유지, 목적지 검증, UNSUPPORTED_COMPLETION 재발 없음  | [page-derived-actions.test.ts](../../../extension/tests/unit/service-worker/page-derived-actions.test.ts); [content/semantic-snapshot.test.ts](../../../extension/tests/unit/content/semantic-snapshot.test.ts); Chrome anchor-menuitem                                                                                                                                                                                              | PASS (통제) |
| R13 | request/chat 계약·이력 복구·Panel 재연결                       | 추가 상태 보존, 구버전 데이터 호환, 동일한 사용자 표시             | [act-completion-recovery.test.ts](../../../extension/tests/unit/service-worker/act-completion-recovery.test.ts); [chat-run-lifecycle.test.ts](../../../extension/tests/unit/service-worker/chat-run-lifecycle.test.ts); Chrome CHAT_RECOVER                                                                                                                                                                                          | PASS (통제) |
| R14 | 진단·export의 새 결과 필드                                     | 상태·통계만 보존, 민감한 원문 유출 없음                            | [act-completion-recovery.test.ts](../../../extension/tests/unit/service-worker/act-completion-recovery.test.ts); [diagnostics-message-handler.test.ts](../../../extension/tests/unit/service-worker/diagnostics-message-handler.test.ts); Chrome redacted ZIP                                                                                                                                                                        | PASS (통제) |

## 구현 결과와 검증 경로

- [완료 계약](../../../extension/src/contracts/act-completion.ts)의 `completion`은
  `action_outcome`, `goal_status`, `reason`, `reassessments`만 받는다. request·chat·
  session 저장·복구·진단 validator를 함께 갱신했다. 구버전 데이터는 추가 필드 없이 읽는다.
- [중간 단계 완료](../../../extension/src/service-worker/act-proposal-completion.ts)는
  step stream만 닫고 `goal_status=checking`을 전달한다. 전체 요청은
  [최종 판단](../../../extension/src/service-worker/act-goal-finalizer.ts)에서 종료한다.
- [관측 검사](../../../extension/src/service-worker/act-goal-observation.ts)는 엄격한
  scope binding과 의미 내용의 최신성을 분리한다. opaque ref 변경은 읽기 비교에서
  정규화한다. [region digest](../../../extension/src/content/completion-region.ts)는
  제한된 dialog/main/form의 텍스트·입력·UI 상태를 로컬에서 비교한다. 민감 컨트롤,
  크기 초과 또는 불완전한 근거는 region 완료 주장에 사용하지 않는다. 모델이
  `evidence_refs`로 유효한 영역을 명시하지 않으면 전체 관찰을 재검사한다.
- [재판단](../../../extension/src/service-worker/act-goal-reassessment.ts)은 200ms 간격
  최대 3회 관찰, 최대 2회 추가 Provider 호출, 총 15초 재확인 deadline을 적용한다.
  기존 180초 요청 budget·Stop·generation 검사도 유지한다. 이전 tool call에 폐기 결과를
  반환하고 새 observation ID를 같은 대화에 제공한다. retry tool은
  `report_goal_status` 하나뿐이며 mutation·계획·scroll·권한 확대는 제공하지 않는다.
- [이동 verifier](../../../extension/src/service-worker/act-postcondition-verifier.ts)는
  선언된 목적지 marker의 유일성·표시 상태와 실제 목적지 URL을 확인한다.
  authoritative result generation 구현 없이 `render_result`를 UI/toast로 대신 검증하는
  경로는 차단한다. 입력·선택·상태 및 UI relation의 기존 verifier는 유지한다.
- [로컬 목표 판단](../../../extension/src/service-worker/act-local-goal.ts)은 trusted
  completion의 `goal_request_digest`가 원래 요청 전체와 일치하고 실제 완료 조건이
  재관찰에서도 충족할 때만 사용한다. 이동은 검증된 목적지 scope까지 일치해야 한다.
  기존 profile은 이 선언이 없어 최신 관찰과 모델 판단을 계속 사용한다. prompt 문자열
  추측이나 중간 action 성공만으로 목표를 승격하지 않는다.
- [공통 Panel 표시](../../../extension/src/sidepanel/act-completion-view.ts)는 확인 중·
  목표 미완료·미확인을 일반 오류와 구분한다. `GOAL_UNVERIFIED` 사유를 전달하며
  실제 FAILED/UNKNOWN action의 typed code와 취소 경계는 보존한다.

회귀 파일은 [service-worker unit](../../../extension/tests/unit/service-worker),
[content unit](../../../extension/tests/unit/content),
[Chrome fixture](../../../scripts/chrome-act-goal-reassessment-fixture.mjs)에서 확인한다.
실행 명령·환경·revision·한계는 [수정 검증 기록](../../evidence/act-completion-after-navigation-2026-10-11.md)에 연결한다.

## 실행한 분석 검증과 한계

| 날짜·revision·환경                               | 실행·시나리오                                                                       | 결과                                                | 한계                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| 2026-10-11, 분석 source revision, 로컬           | ZIP manifest의 9개 파일 길이·SHA-256 확인                                           | 모두 일치                                           | 발생 source commit은 미확인                                            |
| 2026-10-11, 분석 source revision, Node 축소 재현 | 안정/변경된 관찰 × completed/incomplete의 4조건                                     | 변경 관찰은 STALE_BINDING·code 없음·1회 읽기로 종료 | 실제 DOM·Provider 재현 아님; 임시 스크립트는 저장소 회귀 테스트가 아님 |
| 2026-10-11, 분석 source revision, Vitest         | `pnpm exec vitest run extension/tests/unit/service-worker/act-s17-feedback.test.ts` | 7 tests PASS                                        | 기존 동작 확인; 개선안 구현·수정 성공의 증거 아님                      |

위 표는 수정 전 분석 기록이다. 수정 후 단위·통제 Chrome·버전 유지 build 결과는
위 수정 검증 기록에 별도로 보존한다. 실제 사이트·live Provider 재실행과 배포는
진행하지 않았다. 위 표는 이전 분석·문서 저장 단계의 기록이며 현재 수정 검증 결과와 구분한다.

## 해결 완료 조건

- [x] R01에서 실제 목적지 근거로 정상 완료하고 마지막 일반 오류가 표시되지 않음.
- [x] 원래 action의 실행 횟수·검증 결과·승인 경계를 유지함.
- [x] R02~R14의 필요한 단위·fixture·Chrome 회귀 검증 통과 및 테스트·증거 연결.
- [ ] 실제 사이트·Provider에서 같은 흐름 확인; revision·버전·환경·결과 기록.
- [x] 실제 실패·미확인·취소가 정상 완료로 잘못 처리되지 않음.
- [ ] 수정 commit, 미검증 범위, 목록 상태·최근 갱신·다음 작업 갱신.

## 발생·수정·재발 이력

| 날짜       | 상태        | 변경·관찰                                                                                 | 증거                 |
| ---------- | ----------- | ----------------------------------------------------------------------------------------- | -------------------- |
| 2026-10-11 | 분석 중     | 이동 VERIFIED 뒤 목표 UNKNOWN / STALE_BINDING 및 Panel INTERNAL_FAILURE 확인              | 위 요청·trace 식별자 |
| 2026-10-11 | 해결안 정리 | P1~P5와 R01~R14, 완료 조건 기록; 구현 미진행                                              | 이 문서 및 이슈 목록 |
| 2026-10-11 | 검증 중     | P1~P5 구현; 단위·통제 Chrome 회귀 PASS, 실제 사이트·live Provider·commit·배포 확인은 대기 | 위 수정 검증 기록    |

## 2026-10-11 S21 구현·검증 후속

전체 목표 보고 누락 시 읽기 전용 재판단, 공유 예산과 논리 단계 결과 유지를 구현했다.
[소스·회귀·통제/live 증거](../../evidence/s21-assessment-2026-10-11.md)를 연결한다.
기존 이력과 당시 실패 관찰은 보존한다. 현재 상태는 **검증 중**이다.
원래 운영 사이트·배포는 미검증이며, controlled HTTPS와 실제 모델이 연결된 fixture
표본을 실제 사이트 수락 조건 충족으로 대체하지 않는다.

2026-10-11 진단에서 이동 자체가 UNKNOWN인 뒤 provider completed를 수용하지 않은 경우는 다른 원인으로
[ISS-20261011-004](2026-10-11-navigation-provider-confirmation.md)에 기록했다. 본 이슈의 기존 이력과 실제 사이트·배포 확인 범위는 유지한다.

## 2026-10-11 완료 처리 이력

- 상태: 완료 (사용자 요청에 따른 추적 종료).
- 근거: 미확인 범위를 안내한 뒤 사용자가 모든 로컬 이슈의 완료 처리를 명시했다.
- 남은 추적 작업: 없음. 기존 미검증 범위와 실행 증거는 위 이력대로 보존한다.
