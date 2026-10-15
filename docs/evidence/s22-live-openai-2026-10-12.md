# S22 OpenAI live 재검증 — 2026-10-12

**지정 Browser-local live 표본 통과; S22 전체 qualification은 진행 중.**
[OpenRouter 무료 모델의 최초 실패](s22-live-free-2026-10-12.md)를 보존하고,
사용자 요청으로 OpenAI `gpt-6-luna`에서 기본·혼합·holdout 표본을 실행했다.
[JSON 증거](s22-live-openai-2026-10-12.json)에 최초 실패와 재실행을 구분한다.

## 환경과 사전 실행 범위

- 제품 revision `c0ae91f725074fd6671a8036325929d97817e033`, 확장 `0.1.106`.
- Linux, Chrome for Testing `147.0.7727.15`, Node `20.19.6`, pnpm `9.15.4`.
- Worker SHA-256 `96cfbbc8f4d578e38f17cd76cb2b46a94a569f8732c3d7e0d9d98f6874e33aa3`.
- 실제 OpenAI Chat Completions, `max_completion_tokens: 2048`, `reasoning_effort: none`.
- API 키는 사용자 대화형 셸의 환경 변수에서 불러왔다. credential 및 원문 요청·응답은
  기록하지 않았다. 증거는 tool/call ID/결과 metadata와 hash로 제한했다.
- 실행 전에 기본 9건, 혼합 cedar/ridge 2건, holdout variant 1~3의 각 5건을 선택했다.
  holdout은 라벨, native radio, 중첩 DOM 변경이며 각 normal/delayed/replacement/already/blocked를 실행했다.
- 이전 단계의 settlement 수정본으로 시작했다. 이번에는 live 음성 목표의 검사 조건만
  보정했으며 제품 runtime·빌드·버전은 변경하지 않았다.

## 결과와 최초 실패

| 실행                                       | 결과                    | 확인 범위                                                                           |
| ------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| 기본 9건 최초                              | 8/9 PASS, HTTP 200 34회 | generic-click/element/normal/delayed/replacement/not-completed/already/blocked PASS |
| holdout variant 1                          | 5/5 PASS, HTTP 200 21회 | 라벨 변경, 지연·교체·already·blocked                                                |
| holdout variant 2                          | 5/5 PASS, HTTP 200 19회 | native radio, 지연·교체·already·blocked                                             |
| holdout variant 3                          | 5/5 PASS, HTTP 200 21회 | 중첩 DOM, 지연·교체·already·blocked                                                 |
| 혼합 cedar/ridge                           | 2/2 PASS, HTTP 200 20회 | script/Workflow/component/계획/실행/관찰/목표/진단 ZIP                              |
| generic-unchanged 검사 수정 후 최초 재실행 | 0/1 PASS                | HTTP 200 이후 HTTP 500, 실행 전에 종료                                              |
| generic-unchanged 새 격리 profile 재실행   | 1/1 PASS, HTTP 200 5회  | 변경 1회, typed UNKNOWN 유지, goal unknown, 승인 카드 0                             |
| 검사 수정 후 통제 Chrome                   | 9/9 PASS                | deterministic unknown, 성공/미완료/차단 회귀                                        |

live 실행은 총 28건: 26 PASS / 2 FAIL. Provider 호출은 HTTP 200 121회 / HTTP 500 1회.
기본 최초 8/9를 9/9로 덮어쓰지 않는다. 최초 실패를 포함한 전체 기록과
수정 후 재실행을 통해 선택한 26개 서로 다른 사례의 PASS 표본을 확보했다.
이는 공급자 안정성이나 S22 전체 R1~R18 검증 완료를 뜻하지 않는다.

기본 generic-unchanged는 실행을 UNKNOWN으로 유지하고 goal을 `incomplete`로 반환했지만
검증기가 `unknown`만 허용하여 실패했다. 현재 [completion 계약](../../extension/src/contracts/act-completion.ts)은
두 상태를 지원한다. live에서는 두 미완료 상태를 허용하고 controlled는 기존 `unknown`을
유지하도록 [ISS-20261012-004](../issues/records/2026-10-12-s22-live-negative-goal.md)에서 보정했다.
mutation 1회, typed receipt UNKNOWN/POSTCONDITION_UNVERIFIED, Worker goal 일치와
성공 UI 금지 검사는 유지한다. `completed`, 중복 mutation, Worker 불일치 거부도 확인했다.

혼합 흐름은 원본 script·Workflow·component data 읽기, submit_plan과 propose_click,
같은 call ID의 결과 continuation, VERIFIED dispatch, 변경 후 데이터와 실제 목표 UI를
확인했다. 승인 카드 0, decoy/미등록 호출 0이며 두 diagnostic ZIP은 각각 10개 entry로
검증했다. 기존 mixed harness의 일반 단계 선택 클릭 경로는 유지하므로 모든 사용자
선택까지 0회인 qualification으로 일반화하지 않는다.

## 재현

`OPENAI_API_KEY`가 있는 셸에서 `CHROME_FOR_TESTING_BIN`을 설정한 뒤 실행한다.
현재 빌드는 앞선 무료 모델 검증의 버전 보존 빌드·package 검사 결과와 같은 hash다.

```sh
LIVE_PROVIDER=openai S22_LIVE_MODEL=gpt-6-luna \
  S22_REPORT=/tmp/s22-openai-base.json pnpm test:chrome-s22
LIVE_PROVIDER=openai S22_MODE=full S20_LIVE_MODEL=gpt-6-luna \
  S20_REPORT=/tmp/s22-openai-mixed.json \
  node --experimental-websocket scripts/chrome-s20-mixed-smoke.mjs
for variant in 1 2 3; do
  LIVE_PROVIDER=openai S21_VARIANT=$variant S22_LIVE_MODEL=gpt-6-luna \
    S22_CASES=normal,delayed,replacement,already,blocked \
    S22_REPORT=/tmp/s22-openai-holdout-$variant.json pnpm test:chrome-s22
done
LIVE_PROVIDER=openai S22_LIVE_MODEL=gpt-6-luna S22_CASES=generic-unchanged \
  S22_REPORT=/tmp/s22-openai-generic.json pnpm test:chrome-s22
S22_REPORT=/tmp/s22-controlled.json pnpm test:chrome-s22
```

Prettier, Node globals 명시 ESLint와 focused 음성 goal 검사 PASS.
전체 unit/typecheck/lint suite나 제품 빌드를 이번 단계에서 재실행하지 않았다.

## 남은 범위

OpenRouter 무료 endpoint의 가용성·semantic 실패는 해소되지 않았다.
S22 category별 ask/auto/deny 전체 matrix, 설정 이전·race·restart·Stop·scope 변경,
자료·vision·scroll 경계의 전체 R1~R18 runtime 증거는 별도 검증이 필요하다.
운영 사이트·Platform·설치·배포를 실행하지 않았다. S22는 진행 중으로 유지한다.
