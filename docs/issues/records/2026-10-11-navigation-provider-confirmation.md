# ISS-20261011-004: 이동 UNKNOWN 후 provider 완료 판단 미수용

## 현재 상태 — 완료

2026-10-11 사용자의 “모두 완료 처리해” 요청에 따라 이슈 추적을 종료했다.
아래의 검증 중·재검증 필요 표현과 미체크 완료 조건은 완료 처리 이전의 이력이다.
실제 사이트·Provider·사용자 설치·배포 및 기존 미확인 조건을 새로 검증했다는 의미는 아니다.
기존 수정·검증 기록은 보존하며, 같은 문제가 재발하면 이 ID를 다시 연다.

## 관리 정보

| 항목                      | 값                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 상태                      | 완료 (사용자 요청에 따른 추적 종료)                                                                                                      |
| 발생일·최근 갱신          | 2026-10-11 KST                                                                                                                           |
| 영향 범위                 | Act navigate, Worker 완료 판단                                                                                                           |
| 발생 버전·source revision | 진단 버전 0.1.101; 진단 source revision 미확인                                                                                           |
| 분석 source revision      | f4e962f205caf9f0c8b6ad012c0de55a7624c236 및 작업 트리                                                                                    |
| 관련 이슈                 | [ISS-20261011-001](2026-10-11-act-completion-after-navigation.md), [ISS-20260916-001](../2026-09-16-navigation-snapshot-verification.md) |
| 수정 commit·배포 버전     | 미커밋·미배포                                                                                                                            |
| 다음 작업                 | 없음 — 사용자 요청으로 추적 종료                                                                                                         |

## 증상과 재현

진단 요청 `ec39f516-4d5d-4b2a-a910-d8f1f5c26717`에서 이동 dispatch는
`dispatched`, 최초 결과는 `UNKNOWN / NAVIGATION_UNVERIFIED`였다. 이후
`report_goal_status`만 허용한 provider 요청이 실제 전송됐고 provider는
`completed`와 화면 evidence refs를 반환했다. Worker는 `observation_current=true`지만
`verified_actions=0 / UNOBSERVED_ACTION`으로 완료를 거부했다.

Provider는 OpenAI-compatible Responses, 모델 `gpt-5.6-luna`였다. 원문과
민감 URL은 기록하지 않는다. 첫 이동 검증이 실패한 상세 원인과 실제 승인 목적지의
일치 여부는 마스킹된 진단만으로 확정할 수 없다. Worker trace drop이 있으므로
이 기록은 보존된 호출·응답·판단 근거 범위에 한정한다.

## 원인과 근거

`act-action-assessment.ts`는 navigate를 제외하며, `act-goal-feedback.ts`는
실행 결과가 VERIFIED가 아니면 최종 판단으로 즉시 넘어갔다. 따라서 최신 화면과
provider의 유효한 완료 응답에도 이동 UNKNOWN을 확인할 경로가 없었다.
기존 ISS-20261011-001은 VERIFIED 이동 후 최종 관찰 문제이므로 다른 원인으로
새 ID를 부여했다. 기존 이력과 회귀 조건은 유지한다.

## 해결안과 변경 범위

- 링크 화면 참조에 당시 resolved href를 고정하고 실행 직전 일치를 확인한다.
  href 또는 base URL 변경은 기존 승인을 새 목적지에 사용하지 못한다.
- 실제 dispatched 이동의 목적지 해시와 출발 document/page scope를 보존한다.
  raw URL은 실행 증거·provider inventory에 추가하지 않는다.
- 최신 등록 문서의 전체 URL 해시가 실제 실행 목적지와 같고, 출발 document 또는
  page scope와 다르며, 유효한 completed 응답과 화면 evidence refs가 있을 때만
  이동 결과를 llm_evidence로 확인한다. trusted destination marker도 유지한다.
- 최초 raw_outcome/code는 보존하고 재실행하지 않는다. 계획 완료 수는 한 번만 증가한다.
- 다른 목적지·다른 query/hash·임의 redirect·미등록/오래된 문서·잘린 화면·증거 없는
  응답·FAILED·불명확 dispatch는 성공 처리하지 않는다.

## 회귀 검증

- [navigation confirmation unit](../../../extension/tests/unit/service-worker/act-navigation-confirmation.test.ts): 수용·목적지 path/query/hash·scope·dispatch·FAILED·truncation·증거·marker·중복 확인 및 실제 Worker goal flow.
- [runtime binding unit](../../../extension/tests/unit/service-worker/navigation-binding-runtime.test.ts): Content 참조 바인딩이 있는 실제 실행 결과만 보존, 목적지 원문 미노출.
- [browser observation unit](../../../extension/tests/unit/service-worker/navigation-observation-binding.test.ts): snapshot 읽기 중 URL·등록 문서 변경 차단.
- 기존 `act-execution-runtime`, `act-goal-reassessment`, `act-goal-observation`을 포함한 전체 unit 168 files / 797 tests PASS.
- [통제 Chrome 실행](../../../scripts/chrome-navigation-confirmation-smoke.mjs): 늦은 도착 화면은 UNKNOWN → VERIFIED/completed, 다른 목적지는 provider completed에도 UNKNOWN. 이동 제안 각 1회, goal 요청 각각 2회·1회.
- [Content 참조 Chrome 검사](../../../scripts/chrome-navigation-binding-smoke.mjs): href 변경은 TARGET_STALE, base 변경은 TARGET_NOT_ACTIONABLE, 모두 not_dispatched. 직접 Worker 메시지 검사로 provider·승인 UI 검증과 구분한다.
- 관련 S20 통제 Chrome cedar/ridge 두 사례 PASS. 원래 사이트 및 실제 provider 재실행·배포 확인은 별도다.

## 최초 수정의 실행 결과와 당시 완료 조건

- [x] 통제 Chrome에서 최초 UNKNOWN + 승인 목적지 + 최신 증거 + completed 수용.
- [x] 잘못된 목적지, 오래된 scope, FAILED/dispatch 불명확, 증거 누락 차단.
- [x] 기존 이동·최종 완료 판단 회귀 테스트 통과.
- [ ] 필요한 runtime 범위 확인; 원래 사이트·배포 한계 명시.

타입 검사·lint·모듈 경계·method trace·fixture/e2e 검사와 버전을 바꾸지 않는 build/package 검사가 통과했다. 기존 0.1.101 버전 변경은 보존했다.
실행 기준은 위 HEAD + 미커밋 수정이며 Worker build SHA-256은
`063f50103307e4ac06f7ea76eae4de537950355c77189ade7510c56182a2534c`이다.
[실행 증거 JSON](../../evidence/iss-20261011-004-navigation-confirmation-2026-10-11.json)과
[실제 완료 표시](../../evidence/iss-20261011-004-navigation-completed.png)를 연결한다.
원래 사이트·실제 `gpt-5.6-luna` 재실행과 배포 확인은 미검증이며, 임의 redirect는
목적지 일치로 간주하지 않는다. 따라서 해결로 닫지 않고 검증 중으로 유지한다.

## 발생·수정·재발 이력

| 날짜       | 상태    | 변경·관찰                                           | revision·증거                          |
| ---------- | ------- | --------------------------------------------------- | -------------------------------------- |
| 2026-10-11 | 수정 중 | 진단 분석 및 목적지 결합 확인 경로 구현             | 위 요청 ID, 분석 revision              |
| 2026-10-11 | 검증 중 | 구현·단위 797개·통제 Chrome 수용/거절·S20 회귀 PASS | 위 build 해시, 원래 사이트·배포 미확인 |

## 2026-10-11 13:49 재현: 0.1.102

추가 진단 `b85e9afc-67a0-4c14-a13a-3300bb7839c9`에서도 동일 표시가 발생했다.
버전 0.1.102와 `confirmNavigation`의 실제 실행 기록으로 수정 경로가 적용됐음을 확인했다.
최초 receipt는 dispatched / raw UNKNOWN / NAVIGATION_UNVERIFIED이며 navigation_binding이 존재한다.

보존된 trace 근거:

| sequence      | 관찰                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 160566        | act.dispatch.receipt: dispatched, raw_outcome UNKNOWN                                                                     |
| 177771        | parseGoalReport: completed, evidence indexes 107/105                                                                      |
| 177865        | 재관측 ActivePage: 목적지 해시가 실행 목적지 해시와 다름; 실제 snapshot은 truncated=false, trace 배열은 별도 truncation됨 |
| 181330–181332 | confirmNavigation의 검증 guard가 true, 반환값 false                                                                       |
| 181448        | observation_current=true, model_status=completed, verified_actions=0, UNKNOWN / UNOBSERVED_ACTION                         |

목적지 해시 불일치는 실제로 확인된 거절 조건이다. 다만 guard는 여러 조건을 묶었으므로
다른 거절 조건이 동시에 있었는지는 현재 기록만으로 모두 배제할 수 없다.
raw URL이 마스킹되어 redirect/canonical URL 변경/페이지 내부 링크 처리 여부와
승인한 이동 대상과 실제 도착지의 연결 관계는 미확인이다. 화면이 최신이라는 사실만으로
그 관계가 증명되지 않으며, 동일 origin만으로 완료를 허용해서는 안 된다.

Worker trace drop 177,681, Content 972,841, Panel 2,905, lifecycle drop 0이다. 보존된 parse 결과·ActivePage 해시·guard·최종 decision 범위에 한정한 분석이다.
이 재현은 최초 통제 Chrome의 같은 URL 늦은 화면 사례와 다르다. 앞선 PASS 이력을
이 사이트의 해결 증거로 사용하지 않으며 이슈를 검증 중으로 유지한다.

다음 작업: 요청 원문·승인 링크 href·최종 브라우저 URL 또는 추가 브라우저 provenance로
도착지 연결 관계를 확인한 뒤 해당 원인을 회귀 사례에 추가한다. 새로운 accept 조건은
redirect나 화면 내부 동작을 입증하는 별도 근거가 있어야 한다.

빌드된 실제 confirmNavigation 모듈의 축소 재현에서도 다른 조건을 통제한 목적지 해시 불일치는 거절되고, 같은 해시로 교체하면 수용됐다. 이 재현은 URL 불일치 guard의 동작을 확인하며 마스킹된 실제 URL 관계를 재현한 것은 아니다.

## 2026-10-11 추가 조치: URL 진단 보존

사용자가 URL 마스킹 제거를 명시적으로 요청했다. `trace-mask.ts`에서 URL 문자열과
origin/host/path/endpoint의 일괄 마스킹 및 hostname을 credential로 학습하는 규칙을
제거했다. 자격증명·입력값·source/collection/이미지 마스킹은 유지한다.
`trace-recording.ts`의 navigation URL 문자열 반환도 value 필드로 감추지 않는다.

`act.navigation.dispatch`에 source_url/approved_url, `act.navigation.result`에
approved_url/observed_url, 거절된 `act.navigation.confirmation`에 current_url과
DESTINATION_MISMATCH 또는 EVIDENCE_OR_BINDING_UNVERIFIED를 남긴다.
등록 문서 snapshot의 ActivePage에도 브라우저 URL을 기록해 goal 재관측 시점의
실제 주소를 확인할 수 있다. provider execution inventory의 목적지 binding은
계속 해시만 사용하며 URL을 새 dispatch 권한으로 사용하지 않는다.

타입 검사·lint·모듈 경계·전체 단위 169 files / 802 tests·method trace
(1871 methods / 228 runtime modules)·build/package 검사가 통과했다.
빌드 버전은 0.1.103이다. 이미 마스킹된 ZIP의 주소는 복원할 수 없으며 다음 재현에서
확장을 새로고침한 뒤 승인 URL과 최종 URL의 관계를 확인해야 한다.
이 조치는 진단 개선이며 실제 사이트의 목적지 연결 관계와 완료 거절 원인의 해결을
확정하는 것이 아니다. 기존 accept 조건은 유지한다.

0.1.103의 통제 Chrome 양성·음성 두 사례에서 실제 DIAGNOSTICS_BUNDLE_EXPORT 결과의
승인 URL·관측 URL·확인 시점 URL이 문자열로 보존됨을 확인했다. 다른 목적지는
DESTINATION_MISMATCH로 거절되고, 늦은 승인 목적지는 llm_evidence로 완료된다.
[URL 진단 검증 증거](../../evidence/iss-20261011-004-url-diagnostics-2026-10-11.json)를 연결한다.
최종 버전 유지 재빌드 후 영향받는 단위 48개 및 lint·method trace도 통과했다.

## 2026-10-11 15:24 재현 분석: 승인 주소 도착 후 동일 문서의 URL 변경

진단 요청 `d9b6c2a2-aeb6-43a6-8baa-f679bceac2a1`, 버전 0.1.103에서
승인 URL은 `https://chatgpt.com/ko-KR/pricing/`, 최종 URL은
`https://chatgpt.com/#pricing`이었다. 출발 URL은 `/ko-KR/contact-sales/`였다.
이 절은 사용자가 마스킹 제거를 승인한 공개 URL과 안전한 상태만 기록한다.

보존된 증거로 확인한 경로:

| component / sequence | 확인된 내용                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Worker 64251         | 승인 링크 dispatch, navigation_bound=true                                                   |
| Offscreen 325        | 요청 시작 후 36,163ms: 새 문서 DOCUMENT_REGISTER, sender.url과 sender.tab.url 모두 승인 URL |
| Offscreen 381        | 37,693ms: 위와 같은 documentId, sender.url은 승인 URL이며 sender.tab.url은 최종 URL         |
| Worker 67531         | 51,568ms: 승인 URL과 최종 URL 불일치, 최초 verified=false                                   |
| Worker 85419         | report_goal_status 검증 통과, completed, evidence indexes 105/107                           |
| Worker 85513         | 최신 snapshot 122 nodes, truncated=false, 최종 URL 재확인                                   |
| Worker 88980         | DESTINATION_MISMATCH, observation_current=true, evidence_count=2                            |
| Worker 89098         | verified_actions=0, UNKNOWN / UNOBSERVED_ACTION, reassessments=0                            |

원인: 현재 `waitForPageTransition`은 최종 브라우저 URL이 approved URL과 같아야
성공하고, `confirmNavigation`도 전체 URL digest의 일치를 필수로 요구한다.
승인 URL에서 새 문서 등록이 있었고 동일 documentId의 후속 주소 변경도 관측됐지만,
현재 navigation_binding에는 목적지 digest와 출발 scope만 있어 이 도착 이력을 완료
판단에 사용하지 않는다. 따라서 최신 화면과 provider completed를 수용하지 못했다.
앞선 수정이 처리한 같은 URL의 늦은 화면과 다른 조건이며, URL 진단 추가는 정상 적용됐다.

동일 documentId의 URL 변경은 확인된 사실이다. 서버 HTTP redirect 체인이나 구체적인
history API 호출은 기록되지 않아 변경 구현을 단정하지 않는다. 승인 주소에 잠시 머문
동안 모든 최초 검증 조건을 충족한 snapshot이 없었던 상세 원인은 초기 method trace
drop으로 완전히 복원할 수 없다. URL 불일치는 최초 및 최종 거절의 확인된 조건이다.

빌드된 confirmNavigation의 축소 재현에서 다른 guard를 통제했을 때 실제 최종 URL은
거절되고 승인 URL은 수용됐다. 이는 URL guard 재현이며 원래 사이트/provider 재실행이 아니다.
Lifecycle drop=0, Worker=87,703, Content=979,869, Panel=1,390, Offscreen=0이다.

후속 수정 검토 범위: 승인된 dispatch 이후 승인 URL의 도착 documentId를 브라우저
관측으로 묶고, 동일 문서의 후속 URL 전환을 추적한 근거와 최신 goal evidence를 함께
검증한다. 동일 origin이라는 이유나 임의 URL 정규화만으로 수용하지 않는다.
승인 목적지 도착 없이 다른 주소에 도착한 경우, 다른 문서로 바뀐 경우, 추적이 없는
변경은 계속 거절하는 회귀 조건이 필요하다. 이 분석에서는 실행 코드를 변경하지 않았고
이슈는 검증 중으로 유지한다.

[새 진단 분석 증거](../../evidence/iss-20261011-004-destination-transition-2026-10-11.json)를 연결한다.

## 2026-10-11 사용자 지정 정책: provider completed를 최종 completed로 처리

사용자가 "provider가 completed 하면 completed로 처리해줘"라고 명시했다.
앞선 exact URL·도착 문서 추적 조건은 최종 목표 완료를 거절하는 기준으로 사용하지 않는다.
현재 처리 기준은 `act-goal-finalizer.ts`, `act-goal-feedback.ts`와 completion 계약이다.

변경 내용:

- 현재 요청의 observation ID 검증을 통과하고 최신 관찰에 연결된 provider의
  `report_goal_status completed`는 최종 GOAL_VERIFIED / completed로 처리한다.
- 로컬 action UNKNOWN/FAILED, 승인·도착 URL 불일치, 계획의 로컬 완료 수 부족은
  provider의 목표 완료 판단을 거절하지 않는다. 최종 사유는 PROVIDER_COMPLETED다.
- 최초 실행 결과·code·dispatch 이력은 그대로 보존한다. 전체 요청 outcome은
  VERIFIED이며 completion.action_outcome은 로컬 이력의 UNKNOWN/FAILED일 수 있다.
  완료된 요청의 terminal code에 과거 로컬 실패 code를 붙이지 않는다.
- 완료 계약과 Side Panel 표시 및 request/session 복원도 이 구분을 지원한다.
- 현재 관찰이 바뀌었으면 read-only 재관측을 수행한다. 잘못된 observation ID,
  다른 요청·tab·문서의 응답, 중단 후 늦은 응답, 일반 prose를 완료 도구로 간주하는
  처리는 허용하지 않는다. 기존 실행 승인과 dispatch 바인딩은 보존한다.
- 로컬 navigation confirmation은 진단·동작 확인 이력을 남기며 URL 불일치로
  최종 provider 목표 판단을 거절하지 않는다. 원래 링크의 href/base 변경 차단도 보존한다.

현재 완료 조건과 실행 결과:

- [x] 승인 URL과 최종 URL이 달라도 현재 provider completed를 최종 완료로 수용.
- [x] 승인 페이지에서 동일 문서의 history URL 변경 후 provider completed를 수용.
- [x] raw UNKNOWN/FAILED 보존, incomplete/unknown 및 stale/cancel/invalid 응답 회귀.
- [x] 완료 이벤트·request/session 복원·Side Panel 최종 완료 표시 확인.
- [ ] 원래 사이트 및 실제 gpt-5.6-luna에서 새 버전 재현·사용자 설치 확인.

전체 단위 171 files / 813 tests, fixture 1, e2e 1, typecheck, lint, module boundaries,
method trace 1871 methods / 228 runtime modules, build/package 검사 PASS.
새 build는 0.1.104이며 Worker SHA-256은
`7020580763b3a9accecb34f9e8230282728ddf488d75b6d563bea51c0389e480`이다.

통제 Chrome/provider fixture 세 사례(늦은 목적지, 다른 목적지, 같은 문서 URL 전환)에서
실제 승인 UI, 완료 메시지와 진단 bundle을 확인했다. 각 이동 제안은 1회이며,
URL이 다른 두 사례는 action_outcome UNKNOWN을 유지한 채 goal_status completed가 됐다.
사용자 지정 정책에 따라 이전 "다른 목적지 completed 거절" 회귀 기대값을 변경했다.
최초 unit 실행에서 이 이전 기대값 2개가 실패했고 기대값 변경 후 전체 813개가 통과했다.

검증 범위는 통제 fixture와 소스 테스트이며 원래 사이트/live provider를 재실행하지 않았다.
확장 새로고침과 실제 사이트 검증이 남아 상태는 검증 중으로 유지한다.
[provider 완료 수용 증거](../../evidence/iss-20261011-004-provider-completion-2026-10-11.json)와
[실제 완료 표시](../../evidence/iss-20261011-004-provider-completed.png)를 연결한다.

## 2026-10-11 완료 처리 이력

- 상태: 완료 (사용자 요청에 따른 추적 종료).
- 근거: 미확인 범위를 안내한 뒤 사용자가 모든 로컬 이슈의 완료 처리를 명시했다.
- 남은 추적 작업: 없음. 기존 미검증 범위와 실행 증거는 위 이력대로 보존한다.
