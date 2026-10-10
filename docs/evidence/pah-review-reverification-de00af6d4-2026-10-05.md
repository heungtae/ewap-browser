# Page Act Harness 추가 수정 재검증 결과 — de00af6d4

- 검증일: 2026-10-05
- 대상 저장소: `ewap-browser`
- 대상 revision: `de00af6d448ce197b4b435cc10e691b02a3f026d`
- 비교 기준: `a1fd57d6e227eda032981b4481104729708fa8b2..de00af6d4`
- 판정: **기존 수정 효과는 확인했으나 P1 3건, P2 2건이 남아 개발 완료 판정을 보류한다.**
- 이전 보고서: [a1fd57d6e 재검증 결과](pah-review-reverification-2026-10-05.md)
- 기준 문서: [상세 설계](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/34-page-act-context-harness-design.md), [Sprint 계획](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/sprint-page-act-context-harness-plan.md)
- 개발자 기록: [PAH 구현 기록](pah-implementation-record.md)

이 보고서는 개발자 기록과 별도로 직접 수행한 재검증 결과다. 이전 보고서는 당시
revision의 결과로 유지하며, 이 문서가 이후 수정 상태를 기록한다.

## 1. 검증 범위와 제한

추가된 읽기 반복 호출, workflow 적합성 검토 gate, component 마스킹 및 pagination
변경을 확인했다. 기존 실패 입력과 신규 경계 입력을 내부 함수·실제 step runner에서
실행했고, 현재 source로 만든 임시 확장 번들에서 실제 Chrome Side Panel을 실행했다.

Chrome은 격리된 프로필, 로컬 HTTPS fixture, 통제 Provider를 사용했다. Provider는
검토 verdict와 도구 호출을 고정 입력으로 반환하며 실제 LLM 추론을 하지 않는다.
따라서 Chrome 결과는 verdict 이후의 제품 제어 흐름·승인 UI·DOM 변경 검증이며,
범용 자연어 적합성 판단 정확성이나 실제 외부 Provider 검증 결과가 아니다.

내부 재현에는 합성 자료만 사용했다. 실제 credential·고객 페이지·기존 사용자 프로필을
사용하지 않았다. component 마스킹과 pagination은 내부 facade 검증이며,
해당 facade가 실제 페이지 component 획득 경로 전체에 연결됐다는 판정은 아니다.

제품 source, 기존 설계·Sprint·예제·테스트 파일 및 버전은 수정하지 않았다.
재현 스크립트 변경과 확장 빌드는 `/tmp` 복사본에서 수행했다.
이 문서 저장으로 기존 문서의 동기화나 Sprint 완료 처리를 하지 않는다.
live Provider, Platform 테스트, workspace 계약·통합 테스트는 실행하지 않았다.
이번 작업은 Browser 리뷰 문서 추가이며 공유 계약 변경은 없다.

## 2. 이전 잔여 문제의 수정 확인

| 이전 항목 | 이번에 확인된 수정 | 남은 판정 경계 |
| --- | --- | --- |
| R1: 실제 읽기·검토 루프 미연결 | Act에 실제 텍스트 읽기 schema·executor·tool result continuation이 연결됐다. workflow 선택 후 `submit_review`가 실행 도구 제공 전에 호출된다. `mismatch`는 페이지 변경 없이 차단된다. | `partial` 처리와 후보 문맥이 불충분하다. 전체 source/component/계획 harness 완료를 뜻하지 않는다. |
| R2: component 민감값 마스킹 미완료 | 민감 키 아래 배열·객체 전체, query와 fragment의 민감 pair, 한 문자열의 복수 Bearer가 마스킹된다. | URL 키의 percent encoding 우회가 남는다. |
| R3: 기본 pagination 종료 실패 | `max_items` 생략 상태에서도 200→200→150건으로 진행하며 마지막·빈 페이지가 complete로 종료된다. | 확인한 550건·known total·EOF 조건의 결과다. 실제 virtual scroll 복구나 모든 channel을 검증한 결과가 아니다. |

신규 review gate의 atomic approval 저장소 연결도 source에서 확인했다.
이는 모든 action 승인 경로가 새 저장소로 대체됐거나 worker 재시작 복구가 완료됐다는
판정을 포함하지 않는다.

## 3. 잔여 발견 사항

### F1 — [P1] partial 판정에서 변경 계획 없이 원본 workflow 실행

위치: [act-harness-turns.ts](../../extension/src/service-worker/act-harness-turns.ts),
573행 및 632–640행.

`match`와 `partial`이 같은 실행 허용 분기로 들어간다. `partial`에서는 설명 메시지를
추가한 뒤 `proceed: true`를 반환하며, 변경 계획 생성이나 원래 요청 변경 확인 없이
기존 선언을 실행한다. 검토 prompt 자체는 partial을 "fits with stated changes"로
정의하지만 해당 변경을 실행 계획에 반영하는 경로는 없다.

재현:

1. `Search query에 browser test를 입력해줘.`를 요청한다.
2. `Generate local preview` 후보를 선택하고 분석을 시작한다.
3. 통제 Provider가 `submit_review`에 `partial`과 요청 불일치 설명을 반환한다.
4. 기존 단계별 승인 UI를 진행한다.

관찰 결과:

| 상태 | 검토 전 | partial 이후 |
| --- | --- | --- |
| Search query | 빈 문자열 | 빈 문자열 |
| Report scope | 빈 문자열 | `detailed` |
| Include detailed results | false | true |
| Preview | 미생성 | `Preview generated for Detailed.` |

`propose_select_option` → `propose_set_checked` → `propose_click` 순서로 진행했다.
단계별 승인은 거쳤지만, 새 목표·계획 차이에 대한 확인과 request revision 변경은 없다.

필요 조치: 모델이 원본 대비 차이·새 초안 또는 clarification을 제시하고 실제 사용자
응답으로 요청·계획 revision을 확정한 뒤 실행하도록 연결한다. core가 임의로 subset을
고르거나 원본 workflow를 수정하는 해결책은 사용하지 않는다.

종료 기준: partial만으로 원본 실행을 허용하지 않으며, 변경안 확인 전에는 DOM 변경이
없고 확인 후에는 승인된 request·plan revision과 실행 내용이 일치해야 한다.

### F2 — [P1] 검토 payload에서 단계별 대상·분기 조건 누락

위치: [act-harness-turns.ts](../../extension/src/service-worker/act-harness-turns.ts),
470–480행.

후보 요약은 candidate ID, source, title, 단계 수, 도구명 순서, 현재 단계 도구명이다.
원본 선언의 `target`, `next`, `branches`는 전달되지 않는다. 현재 연결된 네 가지
텍스트 읽기 도구에는 후보 원본 정의를 조회하는 도구도 없다.

재현에서는 동일 candidate ID·title·도구명을 가진 두 선언을 구성하고, 한 선언의
click 대상은 `Mark reviewed`, 다른 선언은 `Open menu`로 변경했다. 두 대상이 모두
현재 projection에 나타나도록 하고 원래 요청은 `Mark reviewed 버튼을 눌러줘.`로
고정했다. 두 검토의 Provider messages가 완전히 동일했으며, 통제 `match` 응답에서는
두 경우 모두 `proceed: true`가 반환됐다.

이는 실제 LLM이 두 후보에 잘못된 verdict를 냈다는 검증이 아니라, 실행 의도가 다른
선언을 구별하는 데 필요한 대상 정보가 검토 문맥에 없다는 재현이다.

필요 조치: 마스킹한 원본 정의의 대상·순서·분기 조건과 현재 결속 근거를 전달하거나,
후보 정의를 추가로 읽을 수 있는 inventory/read 경로를 제공한다. 현재 선언 형식에
없는 고정 입력값 필드를 임의로 추가하는 문제와는 구분한다.

종료 기준: 제목과 도구명이 같아도 대상·조건이 다른 후보를 모델이 구별할 수 있으며,
읽지 못한 정의는 판단 근거로 간주하지 않아야 한다.

### F3 — [P1] percent-encoded URL 키로 component 마스킹 우회

위치: [component-facade.ts](../../extension/src/page-act-harness/component-facade.ts),
45–63행, 특히 51–58행.

query/fragment를 `&`·`=`로 분리한 뒤 raw key에 민감값 정규식을 적용한다.
percent encoding을 디코딩하지 않아 `%74oken`을 `token`으로 인식하지 못한다.

재현 입력은 `https://app.test/cb?%74oken=<합성 opaque 문자열>#section`을 일반 `url`
필드에 넣은 행이다. 실제 입력에는 placeholder 대신 credential keyword가 없는
합성 문자열을 사용했다. `maskComponentRows` 결과에 문자열이 그대로 남고
`redacted_count: 0`, `categories: []`가 반환됐다. `readChannel`은 이 마스킹 결과에
`masking.applied: true`를 붙이므로 검사 수행 표시만으로 누출이 방지됐다고 볼 수 없다.

필요 조치: URL parameter 의미를 해석할 때 안전하게 디코딩한 키·값을 검사한다.
인코딩 처리 실패도 명시적으로 다루고, 마스킹 건수·category를 실제 결과와 일치시킨다.

종료 기준: raw·encoded 민감 키에서 합성 값이 반환 결과에 남지 않고 실제 마스킹이
건수·category로 기록돼야 한다. 정상 비민감 URL 정보 보존도 함께 확인한다.

### F4 — [P2] 이미 변환된 revision을 다시 변환해 도구 축소 검사 생략

위치: [act-step-runner.ts](../../extension/src/service-worker/act-step-runner.ts),
270–280행. 생성 경로는 [act-chat-start.ts](../../extension/src/service-worker/act-chat-start.ts),
113–130행 및 [act-entry-bridge.ts](../../extension/src/page-act-harness/act-entry-bridge.ts)의
`toHarnessRevision`이다.

product generation `0`을 capability 저장 시 harness revision `1`로 변환한다.
runner는 저장된 `request_revision`을 다시 변환해 `2`로 만들고, generation `0`에서
얻은 현재 revision `1`과 비교한다. 같은 요청도 stale로 분류돼 도구 축소 검사를 생략한다.

재현에서는 entry와 현재 snapshot에 textbox를 유지하고, 선언에는
`propose_set_text`를 넣되 실제 제공 도구는 click만 가능한 상태로 구성했다.

| capability revision | 결과 | Provider 호출 수 |
| --- | --- | --- |
| `0` — 기존 단위 테스트의 입력 | `HARNESS_TOOL_NARROWING` | 0 |
| `1` — generation 0에서 실제 생성되는 값 | `ok: true`, `state: ANSWER` | 1 |

필요 조치: generation에서 harness revision으로 변환하는 경계를 한 번으로 고정하고
이미 변환된 값을 직접 비교한다. 생성 경로와 동일한 값으로 회귀 검증한다.

종료 기준: 같은 request generation에서 정상 생성된 capability revision은 stale로
오인되지 않으며, 대상이 여전히 존재하는 도구의 부당한 축소는 Provider 호출 전에
차단돼야 한다. 실제 request 변경에 의한 stale 구분도 유지한다.

### F5 — [P2] 읽기 budget 소진을 COMPLETED / VERIFIED로 기록

위치: [act-step-runner.ts](../../extension/src/service-worker/act-step-runner.ts),
353–365행 및 416–430행.

`loop.exhausted`이면 trace만 남기고 마지막 response content를 tool-less answer로
바꾼다. 이후 일반 answer 분기에서 `COMPLETED`, `VERIFIED`를 기록하고 session을 종료한다.

실제 step runner의 재현 Provider는 세 차례 각각 고유 ID의 `read_page` 호출과
`자료를 더 확인하겠습니다.`라는 내용을 반환했다. mutation·실행 제안은 없었다.
budget 소진 뒤 결과는 다음과 같았다.

```json
{
  "result": { "ok": true, "state": "ANSWER", "message": "자료를 더 확인하겠습니다." },
  "chatCount": 3,
  "terminal": [{ "type": "run_terminal", "outcome": "VERIFIED" }],
  "activity": [{ "type": "activity_finished", "stage": "COMPLETED" }]
}
```

필요 조치: 답변 종료·실제 mutation 검증·사용자 목표 달성·budget 소진을 구분하고,
미완료 이유와 추가 진행 수단을 사용자에게 전달한다. trace에만 미완료 사실을 남기지 않는다.

종료 기준: budget 소진으로 목표가 미달성인 실행을 `VERIFIED` 성공으로 오인하지
않으며, 사용자에게도 중단 원인과 확인 가능한 진행 상태가 표시돼야 한다.

## 4. 실제 Chrome 결과

| 실행 | 판정 | 확인한 동작 |
| --- | --- | --- |
| 기존 accessible-items 전체 | 20/20 PASS | 입력·선택·체크·Preview·탭·메뉴·dialog·disclosure·링크·민감/disabled 경계 |
| Notes의 read-first 경로 | PASS | read result 뒤 Provider 재호출을 거쳐 실제 Notes 입력 |
| 정상 Preview workflow | PASS | `submit_review`의 match 뒤 select→check→click, Preview 생성 |
| Search 요청 + Preview 선택 + mismatch | 차단 확인 | 실행 제안 없음, 승인 실행 없음, 페이지 상태 변경 없음 |
| Search 요청 + Preview 선택 + partial | **결함 재현** | Search는 비어 있고 Preview workflow만 실행됨 |

partial 재현 스크립트의 `PASS` 출력은 잘못된 Preview 실행 상태를 assertion으로 확인한
결과다. 사용자 목표 성공 또는 수정 완료 테스트의 PASS로 해석하지 않는다.

## 5. 검증 명령과 결과

다음 검사는 문서 저장 요청 직전 재검증에서 실행했다. 이번 문서 저장 단계에서
제품 테스트를 재실행하지 않았다.

| 검사 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit -- --reporter=dot` | 126 files, 569 tests PASS |
| `npm run test:fixture -- --reporter=dot` | 1 file, 1 test PASS |
| `npm run test:e2e -- --reporter=dot` | 1 file, 1 test PASS; 실제 Chrome 검사는 별도 실행 |
| 현재 source의 임시 확장 번들 빌드 | PASS; 버전 bump 없이 5개 진입점 빌드 |
| 실제 Chrome Side Panel smoke | 기존 20개 PASS, 별도 mismatch 차단·partial 결함 재현 |
| 내부 facade·gate·runner 재현 | 마스킹·pagination 수정 확인 및 F2–F5 재현 |

번들 입력은 226개이며 `page-act-harness` 모듈 8개가 포함됐다:
`contracts`, `bootstrap-composer`, `capability-check`, `act-entry-bridge`, `read-loop`,
`approval-store`, `workflow-review`, `outcome`.
이는 실제 텍스트 읽기·검토 경로가 추가됐다는 근거이며 모든 Harness 모듈의 제품
연결이 완료됐다는 근거는 아니다.

## 6. 재현 자료

이번 재검증 자료는 `/tmp/pah-review2-1xCw4S/`에 생성했다.

| 파일 | 내용 |
| --- | --- |
| `normal.json`, `normal.log` | 기존 Chrome 20개 결과·Provider 제공 도구·전후 DOM 상태 |
| `forced-mismatch.json`, `forced-mismatch.log` | 무관 workflow의 mismatch 차단 결과 |
| `forced-partial.json`, `forced-partial.log` | partial에서 원본 Preview 실행 결과 |
| `repro.ts`, `repro-results.json`, `repro.log` | component·후보 payload·revision·budget 재현 |
| `bundle-inputs.json`, `dist-extension/` | 해당 source의 번들 입력·임시 확장 아티팩트 |

별도 검사 로그는 `/tmp/pah-review2-{typecheck,lint,unit,fixture,e2e}.log`다.
임시 파일은 Git에 포함하지 않았으며 시스템 정리로 삭제될 수 있다. 핵심 입력,
실제 결과, source 위치, 종료 기준은 이 문서에 독립적으로 기록했다.

## 7. 후속 검증 범위

F1–F5 수정 후 동일 재현 조건으로 확인하고, 특히 모델 verdict 이후 실제 실행 경로와
Provider에 전달되는 후보 원본 정보를 다시 검사한다. 단위 테스트 통과만으로 실제
Chrome 동작이나 live 모델 판단을 완료 처리하지 않는다.

실제 Provider 판단 정확성, source/component 추가 읽기의 제품 연결,
worker 재시작·승인 복구, Platform·workspace 통합 및 공유 계약 호환성은 별도의
검증 범위다. 이 보고서로 해당 영역이나 Sprint 전체를 완료 처리하지 않는다.
