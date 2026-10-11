# ISS-20261011-003: 웹 컨트롤 후보·실행·검증 지원 범위 불일치

## 관리 정보

| 항목             | 값                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 상태             | 해결안 정리                                                                                                                      |
| 발생일·최근 갱신 | 2026-10-11 KST                                                                                                                   |
| 영향 범위        | DOM role/type/state 수집, generic action schema, inventory, executor, verifier                                                   |
| 발생 환경        | 통제 Chrome `147.0.7727.15`, ContextPilot `0.1.100`                                                                              |
| 분석 source      | HEAD `549ebacc76b5608d80ca70ab71610da11bbc29f0` + 미커밋 작업 트리                                                               |
| 관련 이슈        | [ISS-20261011-002](2026-10-11-aria-radio-button-execution.md), [ISS-20261011-001](2026-10-11-act-completion-after-navigation.md) |
| 수정 commit·배포 | 미구현·미배포                                                                                                                    |
| 다음 작업        | 공통 capability 판별로 schema·실행·검증을 맞추고 타입·비활성·editor 후보부터 정정                                                |

## 증상과 재현

[호환성 audit](../../evidence/web-element-compatibility-audit-2026-10-11.md)에서
수집 → 실제 generic schema → Worker/Content 메시지를 대조했다.
[26개 관찰과 SHA-256](../../evidence/web-element-compatibility-audit-2026-10-11.json)을 보존한다.

| 증상                                                                                | 확인 방법                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `input[button/file/range/date/number]`가 모두 textbox와 text 입력 후보              | 실제 Content snapshot + compiled generic schema                           |
| `contenteditable[role=textbox]`에 text 도구 제공, 실제 값 검증은 `INVALID_ARGUMENT` | Worker → Content semantic verifier                                        |
| `readonly`, `aria-disabled=true`, disabled fieldset 자식이 실행 후보                | 실제 Content snapshot + schema; 해당 차단 대상에 mutation은 시도하지 않음 |
| `select[multiple]`에 단일 값 selection 도구 제공                                    | 실제 snapshot + schema; multi-value 선택 실행은 미검사                    |
| toggle pressed·native mixed 상태 미수집                                             | 실제 Content snapshot                                                     |
| native checkbox가 이미 원하는 상태인데 `TARGET_NOT_ACTIONABLE`                      | Worker → Content checked 실행; 첫 번째 실제 선택 성공, 두 번째 거절       |

위 사실은 원래 사이트나 전체 승인/Provider 경로를 재현한 결과가 아니다. number/date가
어떤 값도 입력할 수 없다는 주장도 아니다. 지원 가능성에 필요한 타입·상태·검증 정보를
일괄 textbox 분류가 소실하며, 불가능하거나 차단되어야 하는 후보도 제공한다는 문제다.
ARIA radio/checkbox의 동일 원인 사례는 기존 ISS-20261011-002에 상세하게 유지한다.

## 원인과 근거

- [Content](../../../extension/src/content/entry.ts)의 `roleFor`가 checkbox/radio/password를
  제외한 input을 textbox로 분류한다. native/ARIA 실제 control kind와 operation capability를
  snapshot에 담지 않는다.
- enabled와 SemanticState의 기준이 own native disabled 및 일부 boolean에 한정된다.
  ARIA disabled·readonly·상속 차단·mixed·pressed를 action별 판정에 사용하지 않는다.
- [page-derived action](../../../extension/src/service-worker/page-derived-actions.ts)과
  [schema](../../../extension/src/service-worker/act-tools.ts)는 visible/enabled/role 중심이다.
  [inventory](../../../extension/src/service-worker/act-execution-inventory.ts)는 제공한
  schema를 곧 supported로 표시한다.
- [executor](../../../extension/src/service-worker/act-execution-runtime.ts)·Content·
  [verifier](../../../extension/src/service-worker/act-postcondition-verifier.ts)는 다른 native
  타입과 상태 조건을 요구한다. readonly의 CDP editable=false 차단처럼 뒤늦게 발견되는
  경우와 editor처럼 typing 준비와 확인 경로가 갈리는 경우가 있다.

shadow/frame/hover/file upload 등 명시적으로 구현되지 않은 모든 기능을 이 버그의
완료 조건으로 합치지 않는다. 이번 수정 범위는 기존 도구의 지원 정합성과 잘못된 후보다.

## 해결안과 변경 범위

[Browser Act S21](../../sprints/s21-act-evidence-based-llm-assessment.md)의 C1~C5에
capability 정합성·실행 receipt·현재 관찰·LLM 예외 및 완료 판단을 연결했다. 기존 실행기를
유지하며 판단이 어려운 경우만 추가 확인한다. 현재 이 이슈의 구현과 정상 기대값 회귀는
미완료이며 Sprint 연결만으로 상태를 해결로 변경하지 않는다.

- [ ] 실제 DOM 타입과 지원 ARIA 구현을 구분하는 공통 control capability/state reader를 둔다.
      collector·schema·executor·verifier의 지원 기준을 공유하며 page 제공 role은 권한으로 삼지 않는다.
- [ ] native input 타입을 구분하고 지원하지 않는 button/file/range 등에는 text 입력 도구를
      제공하지 않는다. number/date는 타입별 입력·검증을 구현하기 전 부분 지원을 과장하지 않는다.
- [ ] action별 readonly/native disabled/ARIA disabled/fieldset·optgroup/inert를 판정하고,
      snapshot 이후 변경도 dispatch 직전에 재검사한다.
- [ ] rich editor는 실행과 실제 값 확인을 함께 구현하거나 도구 후보에서 제외한다.
      선택은 native/custom, 단일/다중, target별 enum과 상태를 구분한다.
- [ ] 미검증 상태·전용 reader가 없는 pressed/mixed/numeric 상태를 false나 성공으로 변환하지 않는다.
- [ ] 이미 기대 상태인 경우 fresh 상태 증거로 action의 already-satisfied를 구분하고 추가
      mutation을 하지 않는다. 해당 한 단계가 원래 사용자 전체 목표의 완료를 자동 보장하지 않는다.
- [ ] capability/inventory에 실제 지원 여부·미지원 사유·검증 의미를 반영하고 Provider 결과
      continuation·승인·binding·cancel 경계를 유지한다.

## 회귀 검증

| ID  | 조건                                                        | 기대 결과                                                           | 상태 |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------- | ---- |
| R01 | input text/button/submit/reset/image/file/range/date/number | 타입·도구·executor·실제 값 검증의 지원 범위 일치                    | 대기 |
| R02 | native와 button 기반 ARIA checked                           | ISS-20261011-002의 지원/거절 기준 유지, 한 번 실행과 실제 상태 검증 | 대기 |
| R03 | disabled/readonly/ARIA disabled/fieldset/optgroup/inert     | 도구 제공과 dispatch 모두 action별 차단, mutation 0                 | 대기 |
| R04 | contenteditable with/without role, framework editor         | 지원 시 값 입력과 verification 동일 의미; 미지원은 schema 제외      | 대기 |
| R05 | native/custom select, 여러 select, multiple, portal listbox | 실제 target enum과 선택 상태 일치; 지원하지 않는 방식 제외          | 대기 |
| R06 | already satisfied·mixed·pressed·상태 불변·지연·replacement  | 정확한 상태/unknown, 불필요한 재실행 없음, 임의 속성 변경 없음      | 대기 |
| R07 | approval 만료·Stop·scope 변경·DOM replacement               | 기존 실행 권한의 다른 대상 이전 및 추가 mutation 없음               | 대기 |
| R08 | 이동 completion·anchor menuitem·native 입력·request 복구    | ISS-20261011-001 및 과거 navigation 회귀 유지                       | 대기 |

## 실행 결과와 완료 조건

2026-10-11: 기존 관련 8 unit suites / 57 tests PASS. 통제 Chrome의 26개 기준 상태
관찰 재현. 재현 script는 현재 결함을 assert하므로 수정 성공을 의미하지 않는다.
명령·정확한 범위·한계는 [audit](../../evidence/web-element-compatibility-audit-2026-10-11.md)에 있다.

- [ ] 기존 제공 action의 지원 기준 정합성 및 위 결함 수정.
- [ ] 위 회귀를 정상 기대값으로 검증하고 승인·Provider continuation 포함한 Chrome 증거 기록.
- [ ] 관련 radio 및 navigation 이슈의 회귀 실행, 수정 revision과 미검증 유형 명시.
- [ ] 목록과 상세 상태 함께 갱신. 원래 사이트/live 검증 범위는 실제 확인된 것만 기록.

## 이력

| 날짜       | 상태        | 관찰·변경                                                                              |
| ---------- | ----------- | -------------------------------------------------------------------------------------- |
| 2026-10-11 | 해결안 정리 | 범용 웹 요소 audit에서 타입·상태·후보·검증의 불일치 확인; 통제 재현과 해결 범위 기록   |
| 2026-10-11 | 해결안 정리 | S21-C1~C5의 공통 지원 기준·현재 데이터 기반 판단 계획에 연결; 기존 원인·회귀 조건 보존 |

## 2026-10-11 선행 수정 범위

[ISS-20261011-002 수정 증거](../../evidence/aria-checked-control-fix-2026-10-11.md):
ARIA button checked reader·실행·지연 상태 검증, native/ARIA no-op, boolean 상태 없는
checked 후보 제외, aria-disabled/disabled fieldset 후보 차단을 구현·검증했다.
이 기록의 과거 audit 결과는 당시 관찰로 보존한다. readonly/type/editor/multiple-select,
pressed 및 나머지 capability 불일치는 남아 있으며 전체 이슈 상태는 해결안 정리를 유지한다.

## 2026-10-11 S21 구현·검증 후속

supported_actions와 capability 공통 기준, readonly/unsupported type/editor/multiple-select 제외, native 클릭 지원과 정확한 boolean state reader를 구현했다.
[소스·회귀·통제/live 증거](../../evidence/s21-assessment-2026-10-11.md)를 연결한다.
기존 이력과 당시 실패 관찰은 보존한다. 현재 상태는 **검증 중**이다.
원래 운영 사이트·배포는 미검증이며, controlled HTTPS와 실제 모델이 연결된 fixture
표본을 실제 사이트 수락 조건 충족으로 대체하지 않는다.
