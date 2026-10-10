# 테스트 실행 가이드

## 범위와 사전 검증

S16 페이지 script 탐색과 S17 계획·실행 결과 피드백의 통제 Chrome/live Provider 테스트 기준이다.
명령은 저장소 루트에서 실행한다. 의존성은 `pnpm install --frozen-lockfile`로 설치한다.
현재 변경 범위에 맞춰 다음 검사를 실행하고 결과를 기록한다.

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:fixture
pnpm test:e2e
```

`pnpm build`와 `pnpm test`는 extension 버전을 증가시킨다.
검증만 수행할 때는 아래 버전 보존 빌드를 사용한다.

## Live Provider 기본 설정

2026-10-09 사용자가 지정한 아래 설정을 다음 live 테스트에도 사용한다.
모델을 별도로 지정하지 않은 경우 이 모델로 실행한다.

| 항목        | 기준                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------ |
| Provider    | OpenRouter, `https://openrouter.ai/api/v1/chat/completions`                                      |
| 모델        | `nvidia/nemotron-3.5-lightning:free`                                                             |
| 인증        | 실행 환경의 `OPENROUTER_API_KEY` 사용. 키 값은 문서·Git·로그·evidence에 저장하지 않음            |
| 실행 도구   | `npm run test:chrome-s16`                                                                        |
| live 활성화 | `S16_LIVE_MODEL`에 위 모델을 명시. 생략하면 통제 Provider 테스트이므로 live 결과로 기록하지 않음 |
| Chrome      | 설치된 Chrome for Testing 실행 파일을 `CHROME_FOR_TESTING_BIN`으로 지정                          |
| 결과        | `S16_REPORT`에 실행별 새 경로를 지정하고, 비밀값·소스 원문을 제외한 요약을 evidence로 기록       |

환경 변수에 키가 있는지 값 출력 없이 확인하고, 현재 변경 사항으로 extension을 빌드한 뒤 실행한다.
아래 Chrome 경로는 마지막 검증 환경의 예시이며 실행 전에 설치 경로를 확인한다.

```bash
test -n "${OPENROUTER_API_KEY:-}" || { echo 'OPENROUTER_API_KEY is required'; exit 1; }
npx tsc -p tsconfig.build.json && node scripts/build-extension.mjs && node scripts/validate-package.mjs
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
S16_LIVE_MODEL=nvidia/nemotron-3.5-lightning:free \
S16_REPORT="/tmp/s16-live-nemotron-$(date +%Y%m%d-%H%M%S).json" \
npm run test:chrome-s16
```

판정은 [S16 검증 행렬](sprints/s16-page-script-tool-loop.md#검증-행렬)의 S16-R1~R6을 따른다. live 실행에서는 실제 offered schema,
목록·검색 pagination·bounded read·같은 call ID의 결과 반환·계산 설명·동의 UI·
Provider egress와 진단 ZIP 마스킹·mutation 비발생을 확인한다. 통제 Chrome의
거부·Stop·source 변경·navigation·worker restart 검증은 별도 실행 증거로 유지한다.
HTTP 성공만으로 PASS를 판정하지 않으며, 실패와 재시도도 기록한다.
기존 PASS를 새 실행 결과로 재사용하지 않는다. 마지막 비교 기준은
[2026-10-09 최종 live 증거](evidence/s16-live-tool-loop-fix-2026-10-09.md)다.

## OpenRouter 사용 제한 시 OpenAI 대체 테스트

2026-10-09 사용자 지정: OpenRouter의 quota/인증/가용성 제한으로 live 테스트를
진행할 수 없으면 OpenAI `gpt-6-luna`와 환경 변수 `OPENAI_API_KEY`를 사용한다.
키 값은 저장하지 않는다. `LIVE_PROVIDER=openai`를 명시하면 테스트 proxy가
`https://api.openai.com/v1/chat/completions`로 요청한다. 기본값은 `openrouter`다.
진행 중인 요청의 Provider를 바꾸지 않고 새 Chrome profile·새 report로 재실행한다.

Chat Completions 함수 호출을 위해 `reasoning_effort: "none"`과
`max_completion_tokens: 2048`을 사용한다.
[공식 GPT-6 Luna 계약](https://developers.openai.com/api/docs/models/gpt-6-luna)을 따른다.
이 설정은 테스트 proxy에 적용하며 제품의 Provider 기본 설정을 변경하지 않는다.

키가 `~/.bashrc`에만 export되어 있으면 그 설정을 읽은 대화형 셸에서 실행한다.
앞 절의 버전 보존 빌드 후 다음 명령을 사용한다.

```bash
test -n "${OPENAI_API_KEY:-}" || { echo 'OPENAI_API_KEY is required'; exit 1; }
LIVE_PROVIDER=openai S17_LIVE_MODEL=gpt-6-luna \
ACCESSIBLE_ITEMS_CASES=search,multiple \
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
ACCESSIBLE_ITEMS_REPORT="/tmp/s17-live-openai-$(date +%Y%m%d-%H%M%S).json" \
pnpm test:chrome-s17
```

S16도 `LIVE_PROVIDER=openai S16_LIVE_MODEL=gpt-6-luna`와 기존 S16 명령을 사용한다.
S15는 `LIVE_PROVIDER=openai S15_LIVE_MODEL=gpt-6-luna`와 `pnpm test:chrome-s15`를 사용한다.
통제 테스트는 live model 변수를 생략하므로 실제 Provider 요청을 하지 않는다.
OpenAI 결과는 OpenRouter 결과와 구분하고, HTTP 성공뿐 아니라 해당 Sprint의
tool call·승인·관찰·정확한 요청값·진단 ZIP 기준을 모두 검사한다.

## 통제 Chrome 테스트

live 모델 없이 승인·거부·Stop·source 변경·navigation·worker restart를 검증한다.
이미 export된 `S16_LIVE_MODEL`이 있어도 아래 명령은 통제 Provider로 실행한다.
아래 실행은 앞 절의 빌드 완료 후 수행한다.

```bash
env -u S16_LIVE_MODEL \
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
S16_REPORT="/tmp/s16-controlled-$(date +%Y%m%d-%H%M%S).json" \
pnpm test:chrome-s16
```

## S15 / PAH-9 입력값·추가 질문 검증

OpenAI 대체 설정은 위 절을 따른다. 기본 6개는 명확한 값, label·DOM ID·Unicode holdout,
값 없는 질문, 긴 값, 두 필드, 권한 거부다. 제품 코드는 요청값이나 질문 필요성을
판단하지 않으며 실제 모델의 도구 호출과 승인 UI를 검사한다.

```bash
LIVE_PROVIDER=openai S15_LIVE_MODEL=gpt-6-luna \
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
ACCESSIBLE_ITEMS_REPORT="/tmp/s15-live-openai-$(date +%Y%m%d-%H%M%S).json" \
pnpm test:chrome-s15
```

질문 전 페이지 불변, 실제 `request_clarification`, 사용자 응답의 동일 call ID 반환,
명확한 값의 추가 입력 폼 부재, 각 동작 승인, 정확한 DOM 값, 최종 피드백과 ZIP 마스킹을 검사한다.
계획이 제출되면 계획 승인과 동작 승인을 별도로 처리하며 중간 idle을 최종 종료로 보지 않는다.

입력만 명시한 값 없는 요청의 보조 재현은
`S15_INPUT_CLARIFICATION_CASE=1 ACCESSIBLE_ITEMS_CASES=clarification-input`을 추가한다.
이 보조 사례의 PASS로 기본 `clarification` 실패를 대체하지 않는다.
`LIVE_MAX_OUTPUT_TOKENS`는 기본 2048, 허용 범위 512~16384다.
긴 값에서 `finish_reason:length`와 잘린 인자가 나오면 8192로 진단 재실행하고
기본 한도 결과와 구분한다. 모델의 인자·입력값을 코드에서 복구하거나 만들어 넣지 않는다.

[수정 전 실패 기록](evidence/s15-live-openai-verification-2026-10-09.md)과
[수정 후 live 검증](evidence/s15-live-fix-2026-10-09.md)을 따른다.

긴 원래 요청은 모델이 `value_span`의 opaque source ID·UTF-16 시작/끝 위치를 선택할 수 있다.
제품은 해당 원문 범위만 복원하고 전체 값 승인·revision·DOM verifier를 그대로 적용한다.
잘린 응답·invalid JSON·여러 동작 제안은 실행하지 않고 동일 call ID의 오류로 한 번만 재요청한다.
기본 `clarification`은 검색값 질문→정확한 입력을 검사한다. 검색 실행까지 요청한 원래 목표가
남으면 `INCOMPLETE / GOAL_INCOMPLETE`와 남은 작업 안내를 검사하며 목표 완료로 간주하지 않는다.
입력만 요청한 `clarification-input`은 별도 사례로 `completed`까지 확인한다.

## S17 계획·실행 결과 피드백 테스트

S16과 같은 OpenRouter 모델 `nvidia/nemotron-3.5-lightning:free`와 환경 변수
`OPENROUTER_API_KEY`를 사용한다. 실제 키는 저장하지 않는다. 앞 절의 버전 보존 빌드 후 실행한다.

통제 Provider에서는 계획 검토·동작별 승인·단일/다중 입력·권한 거부·버튼 실행·hash 이동·
새 document 이동·400ms 비동기 UI 결과의 8개 시나리오를 확인한다.

```bash
env -u S17_LIVE_MODEL -u ACCESSIBLE_ITEMS_CASES \
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
ACCESSIBLE_ITEMS_REPORT="/tmp/s17-controlled-$(date +%Y%m%d-%H%M%S).json" \
pnpm test:chrome-s17
```

live 테스트는 `S17_LIVE_MODEL`을 명시한다. `ACCESSIBLE_ITEMS_CASES=search`는
계획→계획 승인→동작 승인/권한→실제 입력→최신 관찰→모델 목표 판단을 검사한다.
`multiple`은 두 입력의 정확한 값과 각 동작의 추가 승인을 검사한다.

```bash
test -n "${OPENROUTER_API_KEY:-}" || { echo 'OPENROUTER_API_KEY is required'; exit 1; }
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
S17_LIVE_MODEL=nvidia/nemotron-3.5-lightning:free \
ACCESSIBLE_ITEMS_CASES=search \
ACCESSIBLE_ITEMS_REPORT="/tmp/s17-live-nemotron-$(date +%Y%m%d-%H%M%S).json" \
pnpm test:chrome-s17
```

기본 upstream timeout은 60초다. 진단 재실행에서 `S17_UPSTREAM_TIMEOUT_MS=120000`까지
설정할 수 있으나 제품의 요청 전체 budget을 늘리지는 않는다.
`S17_LIVE_REASONING=off`는 테스트 proxy에서만 `reasoning.enabled=false`를 보낸다.
기본값은 Provider 설정을 유지하며, 이 옵션을 사용한 결과는 기본 reasoning 결과와 구분한다.
[OpenRouter reasoning 계약](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)을 따른다.
모델 fallback이나 강제 tool choice는 사용하지 않는다.

HTTP 200뿐 아니라 유효한 `submit_plan`, 실제 계획 카드, 동작별 승인, 동일 call ID의
실행 결과 반환, 최신 observation ID를 가진 `report_goal_status`, 실제 요청값 적용,
진단 ZIP 마스킹을 확인한다. 미지원 계획 단계는 삭제하지 않고 기술 오류로 반환한다.
`VERIFIED`는 동작 검증이며 `GOAL_VERIFIED`는 최신 관찰과 typed 결과를 받은 모델의 목표 판단이다.
모델의 설명으로 typed FAILED/UNKNOWN을 성공으로 바꾸지 않는다.

Page API의 성공·이미 만족됨·throw·timeout·Stop·scope 변경·restart·replay 차단은
`pnpm test:chrome-s10`으로 회귀 검증한다. S15 입력과 S16 source 경계도 각각
`pnpm test:chrome-s15`, `pnpm test:chrome-s16`으로 확인한다.
구현과 실패 이력은 [S17 구현·검증 증거](evidence/s17-plan-feedback-2026-10-09.md),
최종 OpenAI 결과는 [live 검증 증거](evidence/s17-live-openai-luna-2026-10-09.md)를 따른다.

## S18 workflow 목록·원본·검토 테스트

버전 보존 빌드 후 `pnpm test:chrome-s18`을 실행한다. 실제 Chrome에 저장 원본,
서명된 Profile workflow, 페이지 generated 선언을 함께 제공하고 세 출처의 match/mismatch
6개를 검증한다. 통제 Provider는 목록 pagination과 256-byte 원본 continuation을 수행한다.
무관한 Preview 선택에서 Search 입력 목표를 바꾸거나 Preview를 실행하지 않아야 한다.

```bash
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
ACCESSIBLE_ITEMS_REPORT=/tmp/s18-controlled.json pnpm test:chrome-s18
```

live는 `S18_LIVE_MODEL=nvidia/nemotron-3.5-lightning:free`, `OPENROUTER_API_KEY`를 사용한다.
OpenRouter 제한 시 `LIVE_PROVIDER=openai S18_LIVE_MODEL=gpt-6-luna`, `OPENAI_API_KEY`를 쓴다.
환경 키가 `~/.bashrc`에 있으면 해당 셸에서 실행하며 키 값은 출력하지 않는다.
`ACCESSIBLE_ITEMS_CASES=s18-saved-match,s18-profile-mismatch`로 일부를 선택할 수 있다.
source filter 선택은 허용한다. 선택 출처의 실제 list/read/review, coverage,
승인·실행 결과, mismatch의 페이지 불변과 진단 ZIP을 검사한다.
세 출처를 매번 전부 읽도록 강제하거나 미검토 후보의 적합성을 대신 결정하지 않는다.
최종 통제/live 결과와 실패 이력은 [S18 증거](evidence/s18-workflow-resources-2026-10-10.md)를 따른다.
fixture는 scope·checkbox·Preview 활성화 상태와 화면 안내문을 일치시킨다.
partial/needs_context는 match로 바꾸지 않으며 추가 확인 없이 실행하지 않는다.

## 결과 기록과 한계

실행 날짜, code/build revision, Chrome 버전, Provider/model, 명령, 호출·결과·후속 turn,
성공/실패/재시도와 미검증 범위를 `docs/evidence/`에 기록한다.
`/tmp`의 원시 보고서는 공유하거나 커밋하기 전에 소스 원문과 민감값을 제거한다.
인증 실패·rate limit·응답 파싱 실패는 실패 또는 미검증으로 기록하며, 모델을 임의로 바꾸지 않는다.
통제 fixture와 지정 모델의 Browser-local 연결 결과를 운영 사이트·다른 모델·Platform·배포
완료로 확장하지 않는다. S20 전체 도구 루프의 종합 판정은
[S20 기준](sprints/s20-act-tool-loop-live-qualification.md)을 별도로 따른다.

## S19 Component·vision 테스트

버전 보존 빌드 후 `pnpm test:chrome-s19`을 실행한다. 기본 전체 21건이 통과했다.
펼침·페이지 이동은 계획 검토를 명시한 prompt로 계획·동작 승인 뒤 새 데이터 읽기와
최종 판단 UI를 확인한다. 같은 요청의 새 feedback을 기다리며 partial 판단은 그대로 보존한다.
지원 읽기 채널 19건만 검증할 때는 다음처럼 명시적으로 선택한다.

```bash
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
S19_CASES=table,list,tree,chart,svg,canvas,unclassified,alternative,alternative-missing,scroll,deny,stop,stale,vision,vision-deny,sensitive,vision-sensitive,paging-unsupported,tree-expansion-unsupported \
S19_REPORT=/tmp/s19-supported.json pnpm test:chrome-s19
```

live는 `S19_LIVE_MODEL=nvidia/nemotron-3.5-lightning:free`, `OPENROUTER_API_KEY`를 쓴다.
가용성 실패 시 `LIVE_PROVIDER=openai S19_LIVE_MODEL=gpt-6-luna`, `OPENAI_API_KEY`로
대체하고 실패 이력을 기록한다. `S19_CASES=table,alternative,vision`으로 선택할 수 있다.
`S19_SCREENSHOT_DIR=/tmp`는 실제 동의 카드 screenshot을 저장한다.
격리 test profile의 optional capture 권한 seed와 사용자 Side Panel 동의는 별개이며
native Chrome 권한 prompt 승인까지 자동화했다는 뜻은 아니다.
[실행 증거와 실패 해결](evidence/s19-component-tools-2026-10-10.md)을 따른다.

## S20 종합 qualification

버전 보존 build/package 후 실행한다. Chrome 경로는 실행 환경에 맞게 설정한다.

```bash
pnpm exec tsc -p tsconfig.build.json
node scripts/build-extension.mjs
node scripts/validate-package.mjs
CHROME_FOR_TESTING_BIN=/path/to/chrome S20_REPORT_DIR=/tmp/s20-new-run pnpm test:chrome-s20-qualification
```

전체 통제 그룹은 api/fault/mixed/input/source/plan/workflow/component/ask다.
`S20_GROUPS=api,fault,mixed`처럼 선택할 수 있다. 기존 출력 directory의 log를 덮어쓰지 않으므로
매 실행에 새로운 `S20_REPORT_DIR`을 지정한다. manifest에 exit code·시간·code/build·artifact hash를 기록한다.
개별 명령은 `test:chrome-s20`, `test:chrome-s20-fault`, `test:chrome-s20-api`다.

```bash
CHROME_FOR_TESTING_BIN=/path/to/chrome S20_LIVE_MODEL=nvidia/nemotron-3.5-lightning:free S20_REPORT=/tmp/s20-live-new.json pnpm test:chrome-s20
CHROME_FOR_TESTING_BIN=/path/to/chrome S20_LIVE_MODEL=nvidia/nemotron-3.5-lightning:free S20_API_REPORT=/tmp/s20-api-new.json pnpm test:chrome-s20-api
```

기본 인증은 OPENROUTER_API_KEY이며 위의 기존 대체 규칙을 따른다. 개별 live 모델 변수와
controlled qualifier를 혼합하지 않는다. 읽기 turn 12/read 24, 요청 시간 통제 90초/live 240초,
upstream 60초를 테스트가 늘리지 않는다. goal UI를 실제 도구의 completed/incomplete 상태와
연결하고, mutation·plan 승인 직후 잠깐 idle인 상태를 최종 완료로 간주하지 않는다.

`scripts/collect-s20-evidence.mjs OUTPUT REPORT...`는 원문 없이 schema hash·call/result·coverage·
typed 결과·goal·승인 metadata를 추출한다. legacy raw report를 그대로 공유하지 않는다.
[측정 계획](evidence/s20-measurement-plan-2026-10-10.md)과
[전체 결과와 한계](evidence/s20-qualification-2026-10-10.md)를 따른다.
