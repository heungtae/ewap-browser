# Page Act Harness 수정 재검증 결과 — c63ee1ad1

- 검증일: 2026-10-06
- 대상 저장소: `ewap-browser`
- 대상 revision: `c63ee1ad1009d7813c83c4c1dec30ef6b488cfce`
- 비교 기준: `de00af6d448ce197b4b435cc10e691b02a3f026d..c63ee1ad1`
- 판정: **기존 재현 조건의 수정 효과는 확인했으나, 추가 조건 P1 2건·P2 1건이 남아 완료 판정을 보류한다.**
- 이전 보고서: [de00af6d4 재검증 결과](pah-review-reverification-de00af6d4-2026-10-05.md)
- 기준 문서: [상세 설계](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/34-page-act-context-harness-design.md), [Sprint 계획](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/sprint-page-act-context-harness-plan.md)
- 개발자 기록: [PAH 구현 기록](pah-implementation-record.md)

이 보고서는 개발자 기록과 별도로 직접 실행한 결과다. 이전 보고서는 당시 revision의
결과로 유지하며, 이후 수정 효과와 잔여 조건은 이 문서에 기록한다.

## 1. 검증 범위와 제한

이전 보고서의 F1–F5 재현 조건을 현재 source에서 다시 실행하고, 새 구현의 분기·
디코딩 실패·본문 없는 도구 응답 조건을 추가로 검증했다. 내부 함수뿐 아니라 실제
`createActStepRunner`와 `ServiceCoordinator`의 반환값·terminal 이벤트도 확인했다.

실제 Chrome에서는 현재 source를 임시 확장 번들로 빌드해 accessible-items의 기존
20개 케이스와, Search 입력 요청에서 무관 Preview workflow를 선택하는 mismatch·
partial 경로를 각각 실행했다. 격리된 Chrome 프로필·로컬 HTTPS fixture·통제 Provider를
사용했다. Provider는 고정 verdict와 호출을 반환하며 실제 LLM 추론을 하지 않는다.

따라서 Chrome 결과는 verdict 이후 제품 제어 흐름·승인 UI·DOM 변경 검증이다.
live LLM의 적합성 판단 정확성, 실제 외부 Provider, Platform·workspace 계약 및
통합 테스트는 검증하지 않았다. component facade 내부 결과를 확인한 것으로,
실제 고객 페이지의 component 획득 경로 전체나 Provider 전달까지 검증한 결과는 아니다.

재현에는 합성 자료만 사용했다. 실제 credential·고객 페이지·사용자 Chrome 프로필은
사용하지 않았다. 제품 source·기존 설계·Sprint·예제·테스트 파일 및 버전은 수정하지
않았고, 재현 스크립트와 빌드는 `/tmp`에서 생성했다. 이번 작업은 Browser 리뷰 문서
추가이며 공유 계약 변경이나 기존 문서 동기화·Sprint 완료 처리를 포함하지 않는다.

## 2. 이전 F1–F5의 수정 확인

| 이전 항목 | 이번에 확인한 결과 | 판정 경계 |
| --- | --- | --- |
| F1: partial에서 원본 workflow 실행 | Chrome에서 `partial`과 `mismatch` 모두 review 1회 이후 실행 제안·승인 실행·페이지 변경 없이 차단됐다. | 기존 잘못된 실행은 해소됐다. 변경 초안 생성·사용자 응답 후 계획 revision 확정·재개 전체가 완료됐다는 판정은 아니다. |
| F2: 후보 대상·분기 정보 누락 | `Mark reviewed`와 `Open menu`로 대상이 다른 선언의 검토 payload가 이제 구별된다. target·기본 next·when·request revision이 전달된다. | branch 목적지가 누락돼 실제 경로가 다른 후보를 구별하지 못하는 잔여 1이 있다. |
| F3: percent-encoded URL 키 마스킹 우회 | `%74oken` 키의 합성 값이 마스킹되고 건수·category가 기록됐다. 기존 중첩 민감값·fragment·복수 Bearer 재현도 통과했다. | 값 디코딩 실패의 민감 판정을 사용하지 않는 잔여 2가 있다. |
| F4: revision 중복 변환으로 도구 축소 검사 생략 | generation 0에서 실제 생성되는 revision 1로 검사하면 `HARNESS_TOOL_NARROWING`으로 차단하고 Provider 호출은 0회다. | 기존 실제 생성값의 실패 조건에서 수정 확인. 모든 request 변경·복구 경로를 검증한 결과는 아니다. |
| F5: budget 소진을 성공으로 기록 | 본문이 있는 읽기 3회 이후 `INCOMPLETE`, `UNKNOWN / CONTEXT_BUDGET_EXCEEDED`로 기록됐다. | 본문 없는 정상 도구 응답에서는 잘못된 Provider 오류로 기록되는 잔여 3이 있다. |

pagination 회귀 검증은 known total 550건·EOF 조건에서 수행했다. 기본 `max_items`
생략 상태의 공급 건수는 200→200→150이며 offset 400과 빈 offset 550에서는 complete로
종료됐다. 실제 virtual scroll 복구나 모든 channel의 완료 조건을 검증한 결과는 아니다.

## 3. 잔여 1 — [P1] workflow 분기 목적지를 검토 문맥에서 생략

관련 기존 항목: F2.

위치: [act-harness-turns.ts](../../extension/src/service-worker/act-harness-turns.ts),
484행 및 497–500행. 실제 분기 선택은
[workflow.ts](../../extension/src/contracts/workflow.ts)의 206–224행이다.

요약은 `branch.when`만 직렬화하고 `branch.next`를 버린다. 현재 기본 `step.next`와
조건은 보이지만, 조건이 참일 때 어느 단계로 이동하는지 모델이 알 수 없다.
요약에 각 step ID도 표시하지 않아 목적지 ID와 단계의 연결 역시 불충분하다.

재현에서는 다음 세 단계를 가진 두 선언을 만들고 `validateWorkflowDeclaration`으로
두 선언 모두 유효함을 확인했다. candidate ID·title·step 순서·도구·대상·기본 next·
조건은 같고 첫 단계의 branch 목적지만 다르다.

| 단계 ID | 도구·대상 | 기본 next |
| --- | --- | --- |
| `scope` | select: `Report scope` | `review` |
| `review` | click: `Mark reviewed` | `cancel` |
| `cancel` | click: `Cancel` | 없음 |

첫 단계의 branch 비교:

```json
{
  "when": { "kind": "last_option_equals", "value": "Detailed" },
  "next": "review"
}
```

두 번째 선언은 위 `next`만 `cancel`로 변경했다. 원래 요청은
`Mark reviewed 버튼을 눌러줘.`로 고정하고 projection에는 세 대상 모두를 넣었다.

관찰 결과:

- 두 검토의 Provider messages가 완전히 동일했다.
- `nextWorkflowStep`에 `lastOption: Detailed`를 넣으면 첫 선언은 `Mark reviewed`,
  두 번째 선언은 `Cancel`을 선택했다.
- 따라서 실제 실행 경로 차이는 검토 payload에 표현되지 않는다.

이 재현은 실제 모델이 잘못된 verdict를 냈다는 검증이 아니다. 적합성 판단에 필요한
경로 정보가 누락돼 모델이 두 선언을 구별할 수 없다는 증거다.

필요 조치: step ID, 기본 next, 각 branch의 when과 next를 서로 연결 가능한 형태로
전달한다. 요약이 잘리면 누락 범위와 원본 정의를 더 읽을 수 있는 경로도 제공한다.
core가 대상·branch를 삭제하거나 임의 경로를 선택해 요청 범위를 줄이지 않는다.

종료 기준: 조건은 같고 목적지만 다른 유효한 후보의 검토 payload가 구별되고,
모델이 조건별 실제 이동 경로를 추적할 수 있어야 한다.

## 4. 잔여 2 — [P1] URL 값의 디코딩 실패 민감 판정을 사용하지 않음

관련 기존 항목: F3.

위치: [component-facade.ts](../../extension/src/page-act-harness/component-facade.ts),
58–73행. 공유 decoder는
[resource-inventory.ts](../../extension/src/page-act-harness/resource-inventory.ts)의
125–141행이다.

`decodeQueryPart`는 디코딩 실패에 `ok: false, sensitive: true`를 반환한다.
component 마스킹은 `decodedKey.sensitive`를 검사하지만 `decodedVal.sensitive`를
검사하지 않는다. 값 판정은 `decodedVal.ok`가 true인 경우에만 일부 적용된다.

재현 입력은 일반 `url` 필드의 다음 구조다. `SYNTHETIC_VALUE` 자리에 credential
keyword가 없는 합성 opaque 문자열을 사용했다.

```text
https://app.test/cb?x=%74%6f%6b%65%6e%ZZ%3DSYNTHETIC_VALUE
```

값에는 인코딩된 `token` 표기와 잘못된 `%ZZ`가 함께 있다. 관찰 결과는 다음과 같다.

```json
{
  "decoder": { "ok": false, "sensitive": true },
  "leaked": true,
  "redacted_count": 0,
  "categories": []
}
```

`maskComponentRows`의 반환 행에 합성 값이 그대로 남았다. 공유 decoder가 민감 상태를
반환해도 consumer가 그 상태를 사용하지 않으므로 검사 수행 자체가 누출 방지를 뜻하지 않는다.

기존 추가 단위 테스트는 encoded key와 key 디코딩 실패를 다루며, 일반 키 아래의
value 디코딩 실패 조건을 확인하지 않는다.

필요 조치: 키와 값 양쪽의 실패·잔류 인코딩 판정을 사용해 명시적으로 마스킹하고,
건수·category를 실제 결과에 맞게 기록한다. 비민감 URL의 정상 정보 보존도 확인한다.

종료 기준: 일반 키 아래의 value 디코딩 실패·잔류 인코딩에서도 합성 민감값이
반환되지 않으며, 실제 마스킹 사실이 건수·category로 기록돼야 한다.

## 5. 잔여 3 — [P2] 본문 없는 정상 도구 응답의 budget 소진을 Provider 오류로 기록

관련 기존 항목: F5.

위치: [act-step-runner.ts](../../extension/src/service-worker/act-step-runner.ts),
354–382행, 특히 370행. 오류 종료 처리는
[act-run-failure.ts](../../extension/src/service-worker/act-run-failure.ts)이다.

본문이 있는 소진은 이제 `INCOMPLETE / UNKNOWN`으로 기록하지만, 본문이 비어 있으면
budget 안내·정확한 terminal 기록 전에 `PROVIDER_UNAVAILABLE`로 실패한다.
도구 호출이 성공적으로 반환됐고 추가 읽기가 budget에 의해 중단된 원인과 일치하지 않는다.

실제 step runner의 통제 Provider를 다음 조건으로 실행했다.

1. 세 응답 각각에 고유 ID의 `read_page` 호출을 넣는다.
2. 매 응답의 `content`는 빈 문자열로 둔다.
3. 읽기는 정상 처리되며 mutation·실행 제안은 없다.

관찰 결과:

```json
{
  "result": { "error": "PROVIDER_UNAVAILABLE" },
  "chatCount": 3,
  "terminal": [
    { "type": "run_terminal", "outcome": "FAILED", "code": "PROVIDER_UNAVAILABLE" }
  ],
  "userDeltas": []
}
```

대조군에서 `content: 자료를 더 확인하겠습니다.`만 추가하면 같은 읽기 3회 후
`state: INCOMPLETE`, `reason: BUDGET_EXHAUSTED`,
`UNKNOWN / CONTEXT_BUDGET_EXCEEDED`로 기록된다. 새 단위 테스트는 이 본문 있는
조건을 검사하므로 전체 테스트가 통과해도 빈 본문 조건의 잘못된 원인 기록은 남는다.

필요 조치: 마지막 모델 본문 존재 여부와 budget 종료 원인을 분리한다. 본문이 없어도
미완료 원인·읽기 횟수·추가 진행 수단을 표시하고 정확한 terminal code를 남긴다.

종료 기준: 본문 있는/없는 정상 읽기 응답에서 budget 소진을 같은 원인으로 기록하며,
실제 Provider 장애와 구별해야 한다. 미달성 목표를 성공으로 기록하지 않는다.

## 6. 실제 Chrome 결과

| 실행 | 결과 | 확인한 범위 |
| --- | --- | --- |
| accessible-items 기존 전체 | 20/20 PASS | 입력·선택·체크·Preview·탭·메뉴·dialog·disclosure·링크·민감/disabled 경계 |
| Notes read-first 경로 | PASS | 읽기 결과 반환 후 Provider 재호출·실제 입력 |
| 정상 Preview workflow | PASS | match 검토 이후 select→check→click, Preview 생성 |
| Search 요청 + Preview 선택 + mismatch | 차단 확인 | review 1회, 실행 제안 0회, 승인 실행 없음, 전후 DOM 상태 동일 |
| Search 요청 + Preview 선택 + partial | 차단 확인 | review 1회, 실행 제안 0회, 승인 실행 없음, 전후 DOM 상태 동일 |

무관 workflow 검증의 요청 원문은 `Search query에 browser test를 입력해줘.`다.
차단 케이스의 PASS는 잘못된 workflow 실행 방지를 뜻하며 원래 Search 입력 목표를
달성했다는 뜻은 아니다. 위 Chrome 결과로 실제 LLM 추론 성능을 주장하지 않는다.

## 7. 실행한 검사

아래 검사는 문서 저장 요청 직전 재검증에서 직접 실행했다.
문서 저장 단계에서는 제품 테스트를 다시 실행하지 않았다.

| 검사 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit -- --reporter=dot` | 126 files, 579 tests PASS |
| `npm run test:fixture -- --reporter=dot` | 1 file, 1 test PASS |
| `npm run test:e2e -- --reporter=dot` | 1 file, 1 test PASS; 실제 Chrome 검사는 별도 실행 |
| 현재 source의 임시 확장 번들 빌드 | PASS; 버전 bump 없이 5개 진입점 빌드 |
| 실제 Chrome | 기존 20개 PASS, 별도 mismatch·partial 차단 확인 |
| 내부 facade·gate·runner 재현 | 기존 수정 효과 확인 및 잔여 1–3 재현 |

번들 입력은 226개이며 method trace inventory는 1,515건이었다.
이 빌드는 실행 검증용 임시 확장 빌드이며, `npm run build`의 버전 증가나 배포·출시
완료를 뜻하지 않는다.

## 8. 재현 자료와 후속 범위

자료는 `/tmp/pah-review3-MFLgrd/`에 생성했다.

| 파일 | 내용 |
| --- | --- |
| `normal.json`, `normal.log` | Chrome 기존 20개 결과·Provider 제공 도구·전후 DOM 상태 |
| `forced-mismatch.json`, `forced-mismatch.log` | mismatch에서 무관 workflow 차단 |
| `forced-partial.json`, `forced-partial.log` | partial에서 무관 workflow 차단 |
| `repro.ts`, `repro-results.json`, `repro.log` | 기존 조건 재검증과 branch·value decode 실패·빈 본문 budget 재현 |
| `bundle-inputs.json`, `dist-extension/` | 번들 입력·임시 확장 아티팩트 |

검사 로그는 `/tmp/pah-review3-{typecheck,lint,unit,fixture,e2e}.log`다.
임시 파일은 Git에 포함하지 않았으며 삭제될 수 있다. 핵심 입력·source 위치·관찰 결과·
종료 기준은 이 문서에 독립적으로 기록했다.

후속 수정에서는 잔여 1–3을 동일 입력으로 재검증하고 기존 Chrome 경로를 회귀 확인한다.
live Provider·실제 모델 추론, source/component inventory의 제품 연결, 계획 변경·
응답 후 재개, worker 재시작·승인 복구, Platform·workspace 계약 및 통합 검증은
별도 범위다. 이 보고서로 해당 영역이나 Sprint 전체를 완료 처리하지 않는다.
