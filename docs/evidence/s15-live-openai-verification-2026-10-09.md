# S15 / PAH-9 OpenAI 검증 — 2026-10-09

## 판정과 범위

**In Progress 유지.** 현재 OpenAI `gpt-6-luna`의 기본 6개 live 기준은
**4 PASS / 2 FAIL**이다. 명확한 값·holdout·다중 입력·권한 거부는 통과했지만,
기존 값 없는 요청의 최종 종료와 긴 값 입력은 실패했다.
제품 코드를 변경하거나 모델 응답을 대신 생성하지 않았다.
이 판정은 Browser-local PAH-9이며 Managed Enterprise Release S15와 구분한다.

[마스킹된 실행 요약](s15-live-openai-verification-2026-10-09.json),
[재현 명령](../test.md#s15--pah-9-입력값추가-질문-검증),
[Sprint 기준](../sprints/s15-pah-9-llm-input-value-binding.md)을 따른다.
키는 `~/.bashrc`의 `OPENAI_API_KEY`에서 읽었으며 값은 저장하지 않는다.
확장 버전은 증가시키지 않은 **0.1.98**이다.

## 실제 Chrome/live 결과

| 사례          | 결과 | 확인한 행동과 실패 경계                                                                                                                                                              |
| ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| search        | PASS | 실제 모델의 대상·값 제안, 추가 value card 없이 승인·정확한 입력·최종 피드백·ZIP 마스킹                                                                                               |
| notes         | PASS | label을 Draft annotation, DOM ID를 memo로 변경한 holdout. Unicode·따옴표·문구의 정확한 입력과 최종 피드백                                                                            |
| clarification | FAIL | 실제 `request_clarification`, 응답 전 페이지 불변, 사용자 응답의 동일 call ID 반환, 승인 후 정확한 입력과 action VERIFIED는 성공. 후속 읽기·`report_goal_status` 이후 오류 UI로 종료 |
| long-value    | FAIL | 기본 2048 output tokens에서 제안이 승인 전 거부됨. 보조 재현에서 `finish_reason:length`, 잘린 JSON 인자, `INVALID_ARGUMENT`, 승인/입력 0건 확인                                      |
| multiple      | PASS | 두 필드·두 값, 실제 계획 승인 1회와 동작 승인 2회, 각 결과 반환, 최신 관찰에서 모델 completed, 정확한 DOM 대응                                                                       |
| deny          | PASS | 실제 동작 제안·승인 후 권한 거부, 입력 비발생, request 종료와 ZIP 마스킹                                                                                                             |

위 6개 판정은 서로 격리된 두 profile에서 완료된 3개씩의 기록을 합친 행렬이다.
단일 6개 suite PASS로 기록하지 않는다. 모든 기록된 기본 호출 23개는 HTTP 200이다.
HTTP 성공이 schema·승인·실행·요청 종료의 성공을 뜻하지 않는다.

### 값 없는 요청의 경계

기본 요청 “검색을 하고 싶어.”는 질문·입력까지 성공했지만 요청 종료는 실패했다.
입력만 요청한다고 명시한 보조 `clarification-input`은 실제 모델 호출 4개 모두 HTTP 200,
질문→같은 call ID 응답→제안/승인→정확한 입력→모델 completed→ZIP까지 PASS다.
보조 PASS로 기본 시나리오의 FAIL을 바꾸지 않는다.

중단한 초기 실행에서는 모델이 입력 후 검색 실행 수단을 찾기 위한 추가 계획을 제출했다.
테스트가 계획 카드를 처리하지 못해 기다렸던 문제를 보완했다. 이후 기본 요청은
최종 오류로 재현됐다. 검색 의도와 입력 단계의 목표 범위 차이는 추가 조사 대상이며,
기본 실패 기록에서 모델의 goal status 값은 수집하지 않아 그 정확한 판단 이유를 확정하지 않는다.

### 긴 값의 경계

기본 한도의 보조 재현은 인자 4444자가 잘린 불완전 JSON이었다.
`LIVE_MAX_OUTPUT_TOKENS=8192`로 늘린 재실행도 `finish_reason:length`,
인자 16752자의 불완전 JSON으로 실패했다. 두 경우 모두 승인과 실제 입력은 0건,
진단 ZIP의 입력 원문 부재는 PASS다. 원본 요청은 1110자이며 모델이 반환할 도구 인자를
코드에서 축약·복구·대체하지 않았다. 출력 한도 증가만으로 해결됐다고 주장하지 않는다.

## 테스트 도구 변경과 검증

- S15에도 실행 inventory·질문/result call ID·결과 count와 안전한 응답 metadata를 기록한다.
- 질문 폼에 응답하기 전 전체 fixture state가 변하지 않았는지 검사한다.
- S17 계획 카드도 승인하되 계획 승인과 실제 동작 승인 수를 별도로 기록한다.
- 실행 사이의 idle로 조기 종료하지 않으며 명시적인 오류 종료는 timeout 전에 기록한다.
- 입력만 요청하는 보조 clarification은 별도 opt-in 사례다. 기본 6개 요청을 바꾸지 않았다.
- test proxy output budget은 기본 2048, 설정 범위 512~16384다. 기본/override/잘못된 범위 검증 PASS.

현재 자동 검증은 **142 files / 669 tests PASS**, typecheck·lint·버전 보존 build·
package validation PASS다. 모듈 경계 282개, method trace의 문서 41모듈·
183 runtime모듈·1631 methods/callbacks PASS다.
실제 통제 Chrome S15 **6/6 PASS**, 공통 driver의 S17 search/multiple 회귀 **2/2 PASS**다.
unit은 missing/stale source revision, fresh ref 재검토, 질문 후 동일 대화,
Stop/terminal 재사용 차단, 민감 대상 거부와 전체 승인값 전달을 포함한다.
기존 source-size FAIL 80개는 이전 증거이며 이번에는 재실행하지 않았다.

초기 live 두 실행은 각각 미처리 계획 대기, 이미 오류로 종료된 긴 값에 대한 테스트 대기로
중단했다. 기록되지 않은 후속 사례는 PASS/FAIL 수에 넣지 않았다.
완료된 기본 6개·보조 질문·긴 값 재현/8192 재실행과 중단 이력을 JSON에 구분한다.
임시 원본 report·masked trace는 `/tmp/s15-*`에 있으며, 저장소에는 값·키·응답 원문을 제외한
결과/길이/boolean/도구 이름과 call ID만 저장한다.

## 남은 완료 조건

기본 clarification 요청의 질문·응답·정확한 입력 이후 안전하고 일관된 최종 종료,
긴 값의 유효한 제안·전체 승인 카드·정확한 입력·목표 확인을 live에서 통과해야 한다.
지원 모델·출력 budget과 실패/미지원 UI 계약을 함께 검토해야 한다.
운영 사이트·임의 모델·배포 검증은 별도다. 이번 작업은 검증이며 제품 수정과 배포는 수행하지 않았다.
