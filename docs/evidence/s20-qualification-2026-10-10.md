# S20 Browser-local 종합 검증 — 2026-10-10

**Completed (Browser-local qualification).** 구현·통제 회귀와 명시된 live 표본의
도구 연결·승인·typed 실행·후속 관찰·목표 판단을 검증했다. 기본 OpenRouter는 이번
측정에서 통과하지 못했다. 모든 공급자/요청의 live 성공이나 출시 준비 완료를 뜻하지 않는다.

[사전 측정 및 추가 진단 계획](s20-measurement-plan-2026-10-10.md)과
[원문 없는 실행 증거](s20-qualification-2026-10-10.json)에 최초 실패·추가 실행을 함께 보존했다.
HEAD 기준은 `0f2ee2be9c62022d364884610fa6bc4cc551ef90` 위의 S20 작업 트리이며,
확장 버전 0.1.98, pnpm 9.15.4, Node 20.19.6, Linux Chromium 147.0.7727.15이다.
최종 실행 manifest는 `/tmp/s20-release-check/manifest.json`이다. 코드/build 및 schema hash,
call/result ID, coverage, typed 결과와 목표 상태를 JSON 증거에 연결했다.

## 구현과 수정

- 실제 executor 등록에서 read 지원 행렬을 생성한다. input/result schema·version·mode·phase·
  consent·request/document binding·budget·미지원 이유가 실행 inventory에 포함된다.
  제공 schema와 지원 executor 목록이 일치하는 것을 unit과 실제 Provider payload로 확인했다.
- 서로 다른 DOM wrapper·label·행 수·script 함수·계산을 가진 cedar(47)/ridge(83)를 추가했다.
  live proxy는 모델 선택을 강제하거나 fixture 답변을 공급하지 않는다. 테스트만 실제 승인
  UI를 클릭하며, 실제 source consent·plan review·action approval·permission 경로를 통과한다.
- 혼합 요청이 read-only로 분류되어 action/plan 도구가 사라지는 live 실패를 수정했다.
  사용자에게 실행 의도가 있으면 그에 앞선 source/component/workflow 읽기도 Act 경로에 둔다.
  페이지의 지시문에서 실행 권한을 얻거나 읽기 전용 요청을 mutation으로 올리지 않는다.
- 모델이 실행 전 plan evidence ID를 목표 observation ID로 쓰는 오류를 발견했다.
  현재 observation enum의 의미를 parameter 설명에 명시했다. 오래된 ID 거부는 유지한다.
- Page API 계획의 `user_input`은 display label이 아니라 정확한 실행 option ID임을 명시했다.
  `high` 승인은 허용하고 `High` label 불일치는 거부하는 실제 parser/plan unit을 추가했다.
- qualification 실행기와 안전한 evidence collector를 추가했다. 기존 artifact를 덮어쓰지 않고,
  그룹별 exit code·시간·artifact SHA를 기록한다. collector는 source/모델 답변/키/이미지 원문을 제외한다.

## 최종 검증 범위

| 경로 | 실행 결과 | 의미와 경계 |
| --- | --- | --- |
| unit / fixture / E2E | 703 / 1 / 1 PASS | 705개; registry/result 계약, 승인된 API 입력 binding 포함 |
| S15 / S16 / S17 / S18 / S19 통제 Chrome | 7 / 6 / 8 / 6 / 21 PASS | 48개; 입력·질문, 소스 동의, 계획/실행, 세 출처 원본, component 채널 |
| 새 mixed 통제 Chrome | 최종 2/2 PASS | source→workflow 원본→component→계획→승인→실행→새 데이터→goal UI |
| 새 fault 통제 Chrome | 최종 2/2 PASS | INVALID_ARGUMENT continuation, 12-round budget INCOMPLETE; mutation 0 |
| 새 등록 API 통제 / OpenAI | 최종 1/1 / 1/1 PASS | 원본 bundle의 등록 API만 1회 호출, High 관찰, completed UI |
| OpenAI mixed | 최종 2/2 PASS | 자연 선택·call IDs·typed VERIFIED·새 데이터·incomplete UI; 전체 목표 완료로 올리지 않음 |
| OpenAI 입력·질문·다중 대상 | 3/3 PASS | S15 선택 표본 |
| OpenAI navigation·비동기 | 2/2 PASS | S17 document-link/async-preview |
| OpenAI workflow 세 출처 match/mismatch | 최초 5/6 PASS, 진단 1/1 PASS | saved-match 최초는 원본 미완독으로 needs_context; 첫 실패를 지우지 않음 |
| OpenAI bounded grid / vision | 2/2 PASS | 실제 scroll/이미지 경로와 coverage 한계 |
| Ask/provider Chrome | 최종 PASS | auth headers, chat/responses SSE, plugin disable, secret redaction, Stop |
| S10 Page API 기존 Chrome | PASS | approval/permission, scope, throw/timeout, Stop, restart/no replay; read-adapter 부분은 복사 bundle의 test hook 사용 |

새 API 검증은 S10 read test hook 없이 원본 `dist-extension`을 사용한다. 지원 origin은
`https://page-api-fixture.invalid/variant`의 bundled fixture adapter뿐이며 실제 사이트 API
지원으로 확대하지 않는다. script 함수가 보여도 등록 schema/executor가 없는 함수는 실행되지 않는다.

최종 OpenAI mixed 요청 시간은 cedar 39.724초/ridge 35.737초, API는 14.711초였다.
표본 1회씩의 측정이며 latency 분포나 부하 성능을 보장하지 않는다.

## 실패와 재실행을 포함한 결과

원하는 결과만 고르지 않는다. 아래 수치는 서로 다른 수정 revision을 합친 안정성 수치가 아니다.
각 실행의 세부 call 흐름·hash와 결과는 JSON의 run 단위로 구분된다.

- Mixed 통제: 최초 0/2, 비동기 완료 신호와 데이터가 함께 바뀌도록 fixture를 수정한 뒤
  2/2, 추가 계약/증거 검사 2/2, 최종 실행기 검증 각각 2/2. 첫 fixture는 expanded 상태가
  데이터보다 먼저 바뀌어 이후 읽기가 이전 데이터를 정확히 반환했다. 제품 verifier를 완화하지 않았다.
- OpenRouter mixed: cedar 0/1(read-only 분류), ridge 0/1(upstream 60초 timeout).
  입력 0/3, component 1/2이며 vision은 HTTP 429. `docs/test.md`의 기존 대체 규칙으로 OpenAI를 사용했다.
- OpenAI mixed: 차례로 0/2, 1/2, 0/2, 2/2. 분류·INCOMPLETE UI 확인 순서·
  현재 observation 설명을 수정한 실행들이다. 마지막 두 goal은 incomplete였다.
- API 통제: 0/1을 네 번 기록한 뒤 1/1. 테스트의 잘못된 search page_size 및 민감값과
  함수가 같은 script에 놓인 fixture의 마스킹 경계를 수정했다. 보안 마스킹은 변경하지 않았다.
  API live는 0/1 세 번 뒤 1/1이며 plan input binding 설명을 보완했다.
- S18 saved-match 최초는 expected match 실패다. needs_context에서 mutation을 막았고,
  telemetry를 추가한 진단 실행은 전체 원본 읽기와 승인을 통과했다. 재실행 성공이 최초 실패의
  원인을 확정하거나 모델 안정성을 보장하지 않는다.

## 카드와 필수 시나리오의 증거

C1은 registry/inventory/unit/실제 schema hash, C2는 두 holdout의 자연 live 선택,
C3은 mixed 및 등록 API의 call/result continuation·승인·DOM/typed/goal,
C4는 S16 Stop/navigation/restart·S19 deny/stale·S10 timeout/no replay·새 budget/contract,
C5는 Ask transport·storage 관련 unit·provider/진단 ZIP 회귀, C6은 이 문서와 실행 artifact로 닫는다.

R1은 S15와 input/clarification unit, R2는 S16 및 mixed script search/chunk,
R3은 등록 API 및 unregistered/decoy 호출 0, R4는 S18의 세 출처 원본·match/mismatch와
실제 needs_context 거부 및 partial/분기 보존 unit, R5는 S19 grid/chart/canvas/continuation,
R6은 mixed·API·S17 navigation/async, R7은 source injection/private sentinel/deny/계약 오류,
R8은 Chrome Stop/restart/stale/budget와 request/approval replay unit으로 연결한다.
통제/단위 근거를 같은 시나리오의 신규 live 성공으로 바꾸지 않는다.

## 검사, 호환성, 한계와 rollback

typecheck, lint, module-boundaries, 버전 보존 build/package, `git diff --check` PASS.
전체 source-size는 기존 초과 파일 86개로 FAIL이며 새 module/script/test는 모두 199줄 이하다.
기존 초과 파일의 대규모 분할을 이 Sprint 완료 주장에 포함하지 않는다.

추가 inventory는 Browser-local Provider 문맥의 선택 필드다. 기존 저장 record, 외부 workspace
producer/consumer 계약, 버전·DB schema는 변경하지 않아 교차 저장소 migration은 필요하지 않다.
Windows/native-host, 실제 사이트별 API/전체 데이터, Platform/Enterprise 활성화, 릴리스·배포,
모든 Provider/model의 안정성은 검증하지 않았다. 기본 OpenRouter는 이번 qualification에서 실패했고
OpenAI의 성공은 문서에 명시한 표본·budget·fixture 범위에만 적용한다.

회귀가 생기면 이번 S20 변경을 되돌려 S19 기준 HEAD로 복구한다. 추가 저장 schema나 데이터
migration이 없다. source/vision/collection 동의를 거부하거나 Page API 권한을 주지 않으면 해당
경로는 실행하지 않는다. 소스 원문을 mutation으로 실행하는 fallback이나 UNKNOWN을 성공으로
올리는 fallback은 추가하지 않았다. 버전 상승·출시/배포·Platform 변경은 수행하지 않았다.
