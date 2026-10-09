# S17 OpenAI live 검증 — 2026-10-09

## 판정

**PASS — Browser-local 단일·다중 입력 live 경로.** OpenRouter 일일 quota HTTP 429 이후
사용자 지정 OpenAI `gpt-6-luna`로 전환했다. `~/.bashrc`에서 export한 `OPENAI_API_KEY`를
읽는 대화형 셸에서 실행했다. 키 값은 저장하지 않았다.

계획→계획 승인→각 동작 승인/권한→정확한 요청값 적용→동일 call ID 결과 반환→
최신 관찰 기반 `report_goal_status`→목표 완료 UI→진단 ZIP 마스킹을 확인했다.
[이전 구현·통제 증거](s17-plan-feedback-2026-10-09.md)와 이번 live 증거를 결합해
S17은 **Completed — Browser-local**로 판정한다.
OpenRouter의 이전 실패를 성공으로 변경하지 않는다. 운영 사이트, 임의 모델,
live Page API/navigation/workflow 일반화와 배포는 별도 검증 범위다.

## 실행 설정과 변경

- 확장 버전 `0.1.98`, 실제 Chrome과 synthetic HTTPS fixture, 실제 OpenAI 모델.
- `LIVE_PROVIDER=openai`, `S17_LIVE_MODEL=gpt-6-luna`, `ACCESSIBLE_ITEMS_CASES=search,multiple`.
- `/v1/chat/completions`, `reasoning_effort:none`, `max_completion_tokens:2048`.
  [공식 GPT-6 Luna 계약](https://developers.openai.com/api/docs/models/gpt-6-luna)을 따른다.
- `scripts/live-provider-config.mjs`가 endpoint·인증 환경 변수·요청 인자를 선택한다.
  기본 OpenRouter 설정을 유지하고 S15/S16/S17 proxy가 같은 설정을 사용한다.
  모델 fallback과 강제 tool choice를 사용하지 않았다. 제품 runtime 코드는 변경하지 않았다.
- 계획 승인 직후 한 run은 종료되고 후속 Provider 호출이 시작된다. 테스트가 그 사이의
  일시적인 idle 상태를 전체 완료로 처리하던 조건을 수정해 최종 목표 피드백까지 기다린다.
- 실행 방법과 다음 fallback 설정은 [테스트 가이드](../test.md#openrouter-사용-제한-시-openai-대체-테스트)에 기록했다.

## 결과

| 시나리오 | 실제 모델 호출                                                 | 승인                | 결과                                                                              |
| -------- | -------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| search   | 6회, 모두 HTTP 200. 분류→계획→읽기→입력 제안→읽기→목표 판단    | 계획 1회 + 동작 1회 | 정확한 값, 실행 VERIFIED, 최신 관찰 기반 목표 완료, ZIP 마스킹 PASS               |
| multiple | 6회, 모두 HTTP 200. 분류→계획→첫 입력→둘째 입력→읽기→목표 판단 | 계획 1회 + 동작 2회 | 두 입력의 정확한 값, 각 추가 승인, 실행 결과 2개 반환, 목표 완료, ZIP 마스킹 PASS |

원본 임시 report는 `/tmp/s17-live-openai-luna-final.json`이다.
[마스킹된 실행 요약·SHA-256](s17-live-openai-luna-2026-10-09.json)에
실제 model ID, HTTP 상태, tool 이름, 결과 call ID, 계획/완료 단계 수, 값 일치 boolean을 기록했다.
원문 Provider 답변·tool 인자·입력값·키는 저장소 증거에서 제외했다.

앞선 두 OpenAI 실행은 모두 세 요청 HTTP 200, 계획 제출·승인과 입력 제안까지 진행했지만
테스트가 먼저 종료되어 FAIL이었다. 두 번째의 마스킹된 trace에서 제안 parser와
review 발행 성공을 확인했으며 제품 실패로 해석하지 않는다. 최종 재실행에서 해결을 확인했다.

현재 lint와 Provider 선택/요청 인자/누락 키 guard 검사는 PASS다.
S17 8개와 S16 6개 통제 Chrome 회귀도 모두 PASS이며 최종 결과는 JSON에 기록했다.
제품 코드가 바뀌지 않아 이전 자동 테스트 669개를 재실행하지 않았다.
기존 source-size FAIL 80개와 이전 Chrome S10/S15 회귀 증거는 이전 기록을 유지한다.
