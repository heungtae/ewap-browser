# 선언형 다단계 Act Workflow 설계

## 목적

여러 화면 구성 요소가 순서·분기·완료 조건으로 묶인 경우에도 ContextPilot은 한 번에 하나의
현재 action만 제안·승인·검증한다. 현재 페이지의 enabled/visible 상태와 option 값은 매 단계
다시 읽으며, 이전 단계의 ref·option enum·권한 결정을 다음 단계에 재사용하지 않는다.

## 선언과 권한 경계

페이지는 실행되지 않는 다음 JSON만 하나 선언할 수 있다.

```html
<script type="application/contextpilot-workflow+json">
  …
</script>
```

`WorkflowDeclaration v1`은 `schema_version`, `id`, `title`, 최대 12개의 `steps`를 가진다.
각 step은 `id`, 허용된 local UI tool, `role + accessible name` target, 기본 `next`와 선택적
`branches`를 가진다. 분기는 직전 선택 option 값 또는 fresh snapshot의 `enabled`, `checked`,
`selected`, `expanded` boolean만 비교한다.

선언은 순서·분기·종료를 결정하는 기준일 뿐 capability, risk, selector/ref, URL, JavaScript,
새 option 값, 승인 생략을 제공할 수 없다. content script는 JSON을 실행하지 않고 크기·형식을
제한해 읽는다. service worker는 현재 snapshot의 visible/enabled 단일 target, action policy,
permission/confirmation, value binding과 postcondition을 다시 검증한다.

유효한 page 선언은 실행 요청의 후보 목록에 추가된다. Profile, 사용자 기록, runtime 후보가 있으면
모델은 시작 여부를 결정하지 않고 사용자가 출처와 계획 카드를 선택한다. 첫 단계부터 모든 mutation은
별도 review card 승인이 필요하다. 후보를 선택하지 않은 경우에만 현재 snapshot 기반 generic Act를
명시적으로 사용한다. Profile도 현재 target/option 후보를 확장하지 않고 더 좁힐 수만 있다.

## 실행과 복구

각 verified action 뒤 service worker가 새 snapshot을 읽어 다음 target과 target별 option enum을
만든다. provider에는 해당 단계의 opaque model ref와 현재 option enum만 노출한다. snapshot과
선언이 맞지 않거나 분기를 고를 수 없으면 `WORKFLOW_STATE_MISMATCH`, 12단계를 넘으면
`WORKFLOW_STEP_LIMIT`으로 종료한다. navigation, document epoch 변경, Stop, 거부, 실패에는
다음 단계로 자동 진행하거나 이전 action을 재시도하지 않는다.

Side Panel은 기존 action review card를 유지하고 workflow가 선택된 경우 현재 단계만 제안한다.
workflow 선언 원문과 branch 값은 진단·provider egress·영구 transcript에 추가하지 않는다.

후보를 고른 뒤의 5분짜리 선택 계획은 `chrome.storage.session`에 선언형 후보·scope·redacted prompt만 저장해
Service Worker 재시작을 복구한다. confirmation nonce, model ref, action value, 실행 대상 ref와 원본 코드에는
저장소 복구 경로가 없으며 browser 종료·만료·실행·일반 한 단계 실행 때 폐기한다.

## 반도체 데모

`trend-analysis.html`은 `제품군 → 공정 노드 → 생산 캠퍼스 → 분석 기간 → 수율 추세 분석 실행`
선언을 제공한다. `trend-analysis.js`의 disabled/unlock 동작은 계속 실제 페이지 상태의 source of
truth이며, declaration만으로 비활성 control을 실행할 수 없다.

## 워크플로우 카탈로그와 사용자 선택

실행 요청마다 ContextPilot은 다음 출처의 후보를 수집해 Side Panel에 함께 표시한다. 추천 순서는
`조직 검증됨(Profile) → 내가 기록함 → 이번 페이지에서 발견`이지만, 사용자가 하나를 명시적으로
선택해야 한다. 출처를 섞거나 자동으로 병합하지 않는다.

| 출처                 | 유지 범위                                    | 실행 전 검증                                   |
| -------------------- | -------------------------------------------- | ---------------------------------------------- |
| Profile              | Resolver가 제공하는 서명·만료 기간           | 서명, origin/path, semantic fingerprint        |
| 내가 기록함          | 현재 Chrome profile의 `chrome.storage.local` | 저장 scope와 semantic fingerprint              |
| 이번 페이지에서 발견 | 현재 tab/document scope 한 번                | 현재 page 선언 또는 사용자 동의 코드 분석 결과 |

후보 선택은 mutation이나 권한 승인이 아니다. 선택한 후보의 title, 출처, 적용 사이트/경로, 단계와
분기를 보여 주는 계획 카드를 확인한 뒤에만 첫 action을 제안한다. 모든 action은 기존 review card,
permission, confirmation, verifier를 계속 거친다. 선택하지 않으면 사용자는 일반 한 단계 Act를
명시적으로 선택할 수 있다.

### 사용자 기록과 수명

기록은 select, checked 상태 변경, click의 순서와 semantic target만 보관한다. option/text 값,
raw ref, selector, HTML, JavaScript는 보관하지 않는다. v1 기록은 선형 흐름과 boolean target-state
분기만 허용한다. 사용자는 Settings에서 이름 변경, 활성/비활성, 복제, 삭제, 재기록을 관리한다.
Chrome 재시작 뒤에도 정의는 남지만, 실행 중 session, 승인, model_ref, target ref와 미완료 단계는
절대 복원하지 않는다.

### 런타임 코드 분석 초안

사용자가 분석 동의를 누른 경우에만 top-frame의 inline/external script를 credentials 없이 읽어
선택한 provider에 한 번 전달한다. 전달 전 script origin과 크기를 표시하고 credential/token/secret
패턴은 제거한다. LLM은 browser tool 없이 제한된 `WorkflowDeclaration` JSON만 반환할 수 있다.
원문은 storage, transcript, diagnostics에 보관하지 않는다. 결과는 현재 tab에서 한 번만 선택 가능한
초안이며, 사용자가 저장해야만 `내가 기록함` 후보가 된다.
