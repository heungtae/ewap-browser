# S20 측정 계획 — 2026-10-10

실행 전 고정한 Browser-local 측정 계획이다. 원하는 결과만 재실행해 PASS로 고르지 않는다.
각 실행·실패·재시도는 별도 report/log로 기록하고 마지막 성공만 보존하지 않는다.

- 최초 HEAD `0f2ee2be9c62022d364884610fa6bc4cc551ef90`, 그 위의 작업 트리.
  버전 0.1.98, pnpm 9.15.4, Linux Chromium-1217, Node 20.19.6.
- 새 composite holdout: cedar(47), ridge(83), DOM wrapper·label·행 수·script 이름·계산 변경.
  두 변형을 각각 통제 1회, 기본 live 1회 실행한다. Provider는 case ID를 입력으로 받지 않는다.
  live에 fixture의 응답·도구 선택 규칙을 전달하지 않는다.
- 기본 live OpenRouter `nvidia/nemotron-3.5-lightning:free`는 우선 cedar 1회 시도한다.
  가용성 실패는 보존하고 docs/test.md의 대체 규칙으로 OpenAI `gpt-6-luna`의 두 변형을 실행한다.
  endpoint/key는 환경에서 읽으며 공유 보고서에는 포함하지 않는다.
- 새 composite의 최대 시간: 통제 요청 90초, live 240초. upstream fetch 60초.
  제품 기존 read loop는 turn 12/read 24 한도를 유지한다. 테스트가 이를 늘리지 않는다.
- 기존 qualification: S15 7개(clarification-input 포함), S16 6개,
  S17 8개, S18 6개, S19 21개를 통제 1회씩 실행한다.
  S10 Page API, Ask/provider/permission 회귀와 전체 unit/fixture/E2E도 실행한다.
- fault: 동의 거부/Stop/navigation/restart는 S16·S19·S10의 실제 Chrome 경로,
  budget/계약 오류/승인 replay는 제품 unit과 신규 Chrome fault로 각각 검증한다.
- live 추가: S15 입력·질문·다중 대상, S17 비동기/navigation, S18 세 출처 match/mismatch,
  S19 virtual grid/vision을 선택한다. 각각 1회이며 실행 범위·실패·미검증은 구분한다.
- 결과: offered schema hash, call ID, result hash/status/coverage, 후속 선택, 실제 승인·typed
  mutation·변경 데이터·goal 상태·진단 ZIP, 경과 시간을 기록한다. 소스·키·이미지 원문은 저장하지 않는다.
- Platform/Enterprise 활성화·Windows·릴리스/배포는 범위 밖이다. 기존 unit 기록을 신규
  Chrome/live로 바꾸거나 교차 저장소 통합 완료라고 주장하지 않는다.

## 재현 후 수정 검증 계획

최초 live에서 혼합 요청이 read-only로 분류되어 계획 도구가 제공되지 않는 것을 발견했다.
2026-10-10 추가 측정: classifier의 mixed action 우선순위를 명시한 뒤 두 holdout을
동일 prompt·budget으로 각 1회 재실행한다. 최초 실패를 보존한다. OpenRouter ridge의
60초 upstream timeout 및 vision HTTP 429를 근거로 기존 대체 규칙에 따라 OpenAI를 쓴다.
OpenAI 입력 3개·grid/vision 2개도 각 1회 추가하며 기본 공급자 실패와 합산하지 않는다.

재분류 후 실제 typed action과 goal 도구를 확인했으나 테스트가 INCOMPLETE UI를
오류 카드로 먼저 중단한 것을 발견했다. UI feedback을 먼저 확인하도록 실행기를 수정하고
동일 두 변형을 OpenAI에서 각 1회 재실행한다(세 번째 OpenAI mixed 실행).

세 번째 OpenAI 실행은 두 사례에서 실행 전 plan evidence ID를 goal observation_id로
잘못 반환해 계약에 의해 거부됐다. 현재 observation enum의 의미를 도구 parameter 설명에
명시하고 동일 두 변형을 각 1회 재실행한다(네 번째 OpenAI mixed 실행).
현재 ID 검증과 이전 관찰 거부는 변경하지 않는다.

S18 saved-match 최초 실패는 원본 읽기 없이 needs_context로 안전하게 종료했다.
계약 오류/coverage를 원문 없이 기록하는 telemetry를 추가하고 saved-match만 1회
진단 재실행한다. 최초 5/6 결과와 분리하며 단순 재실행 PASS를 수정 근거로 삼지 않는다.

등록 API 경로는 production bundle을 변경하지 않은 실제 Page API fixture origin에서
static function 탐색→계획→승인→등록 option 실행→관찰→goal까지 통제 1회/OpenAI 1회
추가한다. 기존 S10의 patched read-adapter harness와 새 API 검증을 분리한다.

API 통제 최초/두 번째 실행은 테스트가 page_size=10을 제공한 계약 오류를 보존한다.
schema 최대 8로 수정 후 1회 재실행한다. 최초 live API proposal 이후 종료 원인은
UI 오류와 current action_ref 일치 여부를 기록하여 1회 추가 진단한다.

API 단일행 script는 secret 마스킹이 그 행의 함수까지 가리는 fixture 문제를 발견했다.
동일 public 함수와 private key/return을 별도 행으로 분리하고 통제/live 각각 1회
추가한다. 제품 마스킹을 완화하지 않으며 이전 API 실패를 모두 보존한다.

API action_ref·option_id·scope는 모두 현재 schema와 일치했다. 계획 user_input에
표시 label을 넣으면 승인된 option ID와 맞지 않아 CONFIRMATION_INVALID가 나는
경계를 발견했다. plan user_input이 정확한 실행 값/API option_id임을 명시한 뒤
동일 API를 통제/live 1회씩 재실행하고 label 불일치 거부 unit을 추가한다.
공개 함수와 private return을 서로 다른 script로 분리해 마스킹 범위도 확인한다.
