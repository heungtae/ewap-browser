# Page Act Harness 미커밋 수정 재검증 결과 — 2026-10-06

- 검증일: 2026-10-06
- 대상 저장소: `ewap-browser`
- 기준 HEAD: `c63ee1ad1009d7813c83c4c1dec30ef6b488cfce`
- 실제 검증 대상: **위 HEAD에 추가된 미커밋 제품 source 수정 3개 파일**
- 판정: **이전 잔여 3건의 재현 조건은 통과했으나, 분기 조건 잘림 P1 1건이 남아 완료 판정을 보류한다.**
- 이전 보고서: [c63ee1ad1 재검증 결과](pah-review-reverification-c63ee1ad1-2026-10-06.md)
- 기준 문서: [상세 설계](../34-page-act-context-harness-design.md), [Sprint 계획](../sprint-page-act-context-harness-plan.md)

이 보고서는 개발자 기록과 별도로 직접 실행한 결과다. 커밋된 `c63ee1ad1` 자체의
판정과 구분하며, 이전 보고서는 해당 revision의 기록으로 유지한다.

## 1. 검증 대상과 범위

검증한 미커밋 수정 파일은 다음과 같다.

| 파일 | 추가 수정 |
| --- | --- |
| [act-harness-turns.ts](../../extension/src/service-worker/act-harness-turns.ts) | 후보 요약에 step ID·branch 목적지 추가 |
| [component-facade.ts](../../extension/src/page-act-harness/component-facade.ts) | URL key/value의 디코딩 실패·잔류 인코딩 판정 사용 |
| [act-step-runner.ts](../../extension/src/service-worker/act-step-runner.ts) | 마지막 본문 유무와 budget 종료 원인 분리 |

이전 보고서의 잔여 3건을 같은 입력으로 다시 실행했다. 분기 판정은 유효한 선언을
검사하는 `validateWorkflowDeclaration`, 검토 gate의 실제 Provider messages,
`nextWorkflowStep`의 다음 동작을 비교했다. 마스킹은 component facade 내부 결과,
budget은 실제 step runner·coordinator의 반환값·terminal·사용자 안내 이벤트를 확인했다.

실제 Chrome에서는 현재 source를 임시 확장 번들로 빌드해 accessible-items 기존 20개
케이스와 별도 mismatch·partial 차단 경로를 실행했다. 격리 프로필·로컬 HTTPS fixture·
통제 Provider를 사용했다. Provider의 verdict·도구 호출은 고정 입력이며 실제 LLM
추론을 하지 않는다. 따라서 UI·도구 제공·승인·DOM 상태를 확인한 결과이고, live LLM의
적합성 판단 정확성을 검증한 결과는 아니다.

재현에는 합성 자료만 사용했다. 실제 credential·고객 페이지·사용자 Chrome 프로필을
사용하지 않았다. component facade 결과가 실제 고객 페이지의 획득·Provider 전달
경로 전체에서 검증됐다는 의미는 아니다. live Provider, Platform·workspace 계약 및
통합 테스트는 실행하지 않았다.

검토 중 제품 source·기존 설계·Sprint·예제·테스트 파일과 버전은 수정하지 않았다.
재현 스크립트와 빌드는 `/tmp`에서 생성했다. 이 문서 추가로 기존 문서 동기화·공유
계약 변경·Sprint 완료 처리·commit/push를 수행하지 않는다.

## 2. 이전 잔여 3건의 수정 확인

| 이전 잔여 | 이번 관찰 결과 | 확인 범위 |
| --- | --- | --- |
| 분기 목적지 누락 | branch 목적지만 `review`와 `cancel`로 다른 두 선언의 검토 payload가 이제 구별된다. step ID와 branch 목적지가 전달된다. | 이전 목적지 누락 재현 통과. 긴 when의 의미 보존은 아래 잔여 문제로 분리한다. |
| value 디코딩 실패 마스킹 누락 | 공유 decoder가 `ok: false, sensitive: true`를 반환한 합성 value가 마스킹된다. `redacted_count: 1`, category `component-sensitive`가 기록되고 값이 남지 않는다. | `%74%6f%6b%65%6e%ZZ%3D<합성 값>`을 일반 URL key `x` 아래 넣은 기존 재현 통과. |
| 빈 본문 budget 종료를 Provider 장애로 기록 | 정상 `read_page` 3회·빈 본문 응답에서 `INCOMPLETE / BUDGET_EXHAUSTED`를 반환하고 `UNKNOWN / CONTEXT_BUDGET_EXCEEDED`로 기록한다. 사용자 budget 안내도 발생한다. | 기존 `FAILED / PROVIDER_UNAVAILABLE` 재현 해소. |

빈 본문 budget 재검증의 핵심 결과:

```json
{
  "result": {
    "ok": true,
    "state": "INCOMPLETE",
    "reason": "BUDGET_EXHAUSTED",
    "reads": 3,
    "rounds": 3
  },
  "terminal": [
    { "type": "run_terminal", "outcome": "UNKNOWN", "code": "CONTEXT_BUDGET_EXCEEDED" }
  ]
}
```

반환 `message`와 `assistant_delta`에도 budget 소진·읽기 횟수·목표 미확인 안내가
포함됐다. 이 검증은 실제 사용자 후속 응답에서 읽기가 재개되는 전체 흐름을 검증한
결과는 아니다.

## 3. 잔여 문제 — [P1] 분기 when의 160자 절단으로 expected 값 소실

위치: [act-harness-turns.ts](../../extension/src/service-worker/act-harness-turns.ts),
498–504행, 특히 501행.

```ts
`when ${JSON.stringify(branch.when).slice(0, 160)} -> ${clean(branch.next).slice(0, 80)}`
```

branch 목적지는 이제 보존하지만 조건 JSON 전체를 160자로 자른다. 유효한
`target_state` 조건에서 대상 label이 길면 뒤쪽 `expected` 필드가 잘린다.
이때 모델은 checked 상태가 true일 때 이동하는지 false일 때 이동하는지 구별할 수 없다.
잘림·누락 상태도 검토 payload에 명시되지 않는다.

### 3.1 재현 입력

같은 candidate ID·title·단계·대상·기본 next·branch 목적지를 가진 두 선언을 만들고
첫 branch의 `expected`만 true와 false로 변경했다. 두 선언 모두
`validateWorkflowDeclaration`을 통과했다.

| 단계 ID | 도구·대상 | 기본 next |
| --- | --- | --- |
| `open` | click: `Open menu` | `cancel` |
| `review` | click: `Mark reviewed` | `cancel` |
| `cancel` | click: `Cancel` | 없음 |

첫 단계의 branch는 다음 구조다. 두 번째 선언은 `expected`만 false로 바꾼다.

```json
{
  "when": {
    "kind": "target_state",
    "target": {
      "role": "checkbox",
      "name": "Include detailed results and source metadata for every selected report item"
    },
    "field": "checked",
    "expected": true
  },
  "next": "review"
}
```

원래 요청은 `Mark reviewed 버튼을 눌러줘.`로 고정했다. projection과 다음 단계
판정용 snapshot에는 해당 checkbox를 `checked: true` 상태로 포함했다.
검토 당시 checkbox의 관찰 상태는 같고, 원본 조건의 expected만 다르다.

### 3.2 관찰 결과

| 항목 | expected true 선언 | expected false 선언 |
| --- | --- | --- |
| `JSON.stringify(when)` 길이 | 171자 | 172자 |
| 실제 다음 동작 | `Mark reviewed` | `Cancel` |
| 검토 Provider messages | 두 선언에서 완전히 동일 | 두 선언에서 완전히 동일 |
| 잘림·expected 누락 표시 | 없음 | 없음 |

전달된 when의 끝은 다음처럼 잘렸다.

```text
...,"field":"checked","expe -> review
```

`nextWorkflowStep`은 원본의 expected를 사용하므로 실제 다음 동작이 달라지지만,
LLM 검토 문맥에서는 차이가 사라진다. 이전의 branch 목적지 차이 재현은 수정됐으나,
조건 전체의 의미 보존이라는 종료 기준은 아직 충족하지 못했다.

이 결과는 실제 모델이 잘못된 verdict를 반환했다거나 실제 Chrome에서 두 동작이
실행됐다는 증거는 아니다. 유효한 원본 조건의 차이가 검토 입력에서 손실된다는 내부
재현이다. 통제 `match` 응답으로 실제 모델 판단 정확성을 주장하지 않는다.

### 3.3 필요한 조치와 종료 기준

조건의 kind·target·field·expected·목적지를 의미가 보존되는 구조로 전달한다.
직렬화한 조건 전체를 중간에서 절단해 일부 필드를 없애지 않는다. 문맥 budget 때문에
완전한 조건을 전달하지 못하면 잘림·누락을 명시하고 원문을 더 읽을 수 있는 수단을
제공한 뒤 판단하도록 연결한다. core가 조건이나 경로를 삭제·선택해 요청 범위를
줄이는 해결책은 사용하지 않는다.

종료 기준:

- 긴 label을 가진 유효한 target_state 조건에서도 true/false expected가 구별된다.
- branch 목적지와 기본 next, step ID의 연결이 유지된다.
- 일부만 제공한 조건을 완전히 읽은 근거로 간주하지 않는다.
- 같은 상태에서 실제 다음 동작이 다른 후보의 검토 payload가 구별된다.

## 4. 실행한 검증

다음 검사는 문서 저장 요청 직전 재검증에서 직접 수행했다. 이번 문서 저장 단계에서
제품 테스트를 다시 실행하지 않았다.

| 검사 | 결과 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run test:unit -- --reporter=dot` | 126 files, 579 tests PASS |
| `npm run test:fixture -- --reporter=dot` | 1 file, 1 test PASS |
| `npm run test:e2e -- --reporter=dot` | 1 file, 1 test PASS; 실제 Chrome 검사는 별도 실행 |
| 임시 확장 번들 빌드 | PASS; 버전 bump 없이 현재 source의 5개 진입점 빌드 |
| Chrome accessible-items 전체 | 20/20 PASS; Notes read-first·정상 Preview workflow 포함 |
| Search 요청 + 무관 Preview 선택 + mismatch | PASS; review 이후 실행 제안·승인 실행·페이지 변경 없음 |
| Search 요청 + 무관 Preview 선택 + partial | PASS; review 이후 실행 제안·승인 실행·페이지 변경 없음 |
| 내부 함수·runner 재현 | 기존 잔여 3건 수정 확인, 긴 when 절단 문제 재현 |

무관 후보 차단 PASS는 잘못된 실행 방지를 뜻하며 원래 Search 입력 목표의 달성을
뜻하지 않는다. Chrome 결과는 통제 Provider를 사용한 실행 경계 검증이다.

번들 입력은 226개, method trace inventory는 1,515건이었다. 실행 검증용 임시
빌드이며 `npm run build`의 버전 증가나 배포·출시 완료를 뜻하지 않는다.

## 5. 검증 source 식별과 재현 자료

미커밋 source를 검증했으므로 기준 commit만으로 결과를 재현할 수 없다.
검증한 세 파일의 SHA-256은 다음과 같다. 검증 종료 시 같은 값임을 확인했다.

| 파일 | SHA-256 |
| --- | --- |
| `extension/src/page-act-harness/component-facade.ts` | `c3115964bafce62a4029c892fb453de3254b5f27b468119bb596ed81b28d7f12` |
| `extension/src/service-worker/act-harness-turns.ts` | `13da8de3a552541d66df305e60702f31ba2d5c72551756359e3c30a13f637233` |
| `extension/src/service-worker/act-step-runner.ts` | `581cebc2c86b981f7c694b21de23afc9f487fd98ab7c8c0f0214c8fc3b0a2d22` |

재현 자료는 `/tmp/pah-review4-yyf4mo/`에 생성했다.

| 파일 | 내용 |
| --- | --- |
| `reviewed-source.patch`, `reviewed-source.sha256` | 검증한 미커밋 수정·source hash |
| `repro.ts`, `repro-results.json`, `repro.log` | 기존 조건과 긴 when 조건의 입력·결과 |
| `verification-summary.json` | 기준 HEAD·미커밋 검증 대상·수정 확인·잔여 결과 요약 |
| `normal.json`, `normal.log` | Chrome 기존 20개 결과 |
| `forced-mismatch.json`, `forced-mismatch.log` | 무관 workflow mismatch 차단 |
| `forced-partial.json`, `forced-partial.log` | 무관 workflow partial 차단 |
| `bundle-inputs.json`, `dist-extension/` | 번들 입력·임시 확장 아티팩트 |

검사 로그는 `/tmp/pah-review4-{typecheck,lint,unit,fixture,e2e}.log`다.
임시 파일은 Git에 포함하지 않았으며 삭제될 수 있다. 핵심 입력·source 식별·관찰
결과·종료 기준은 이 문서에 독립적으로 기록했다.

후속 수정에서는 긴 when의 의미 보존을 같은 입력으로 재검증하고 기존 짧은 조건·
Chrome 경로의 회귀를 확인한다. live Provider·계획 변경 후 재개·source/component
inventory 연결·worker 재시작 및 승인 복구·Platform/workspace 통합은 별도 범위다.
이 보고서로 해당 영역이나 Sprint 전체를 완료 처리하지 않는다.
