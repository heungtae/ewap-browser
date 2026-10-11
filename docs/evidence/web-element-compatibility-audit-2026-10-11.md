# 웹 요소 사용 방식 호환성 점검 — 2026-10-11

현재 ContextPilot은 모든 웹 요소 사용 방식을 수용하지 못한다. 일반 입력·선택·
이동과 일부 ARIA UI 패턴을 지원하는 경로는 있으나, **발견된 역할·제공된 도구·
실행 가능성·결과 검증 가능성이 일치하지 않는다.** `$500` ARIA radio는 그 불일치의
실제 사례다. 모델이 웹 표준을 알고 있거나 요소를 읽을 수 있다는 사실이 실행 지원을
의미하지 않는다.

이 기록은 아래 revision의 소스 점검과 통제 관찰이다. 후속 구현의 명세나 영구적인
지원 선언이 아니며, 현재 동작의 SSOT는 링크한 소스와 계약이다.

## 범위와 환경

| 항목        | 확인 범위                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------- |
| 분석 소스   | HEAD `549ebacc76b5608d80ca70ab71610da11bbc29f0` + 미커밋 작업 트리                                 |
| Chrome 번들 | `dist-extension/`, `0.1.100`                                                                       |
| 환경        | Linux, Chrome for Testing `147.0.7727.15`, headless, 격리 임시 profile                             |
| 실행        | 2026-10-11 10:57–10:59 KST, `pnpm@9.15.4`                                                          |
| 표준 대조   | WHATWG HTML input, W3C APG 패턴·역할·상태, Chrome Content Script frame 설정                        |
| 소스 경로   | DOM 수집 → Provider schema → proposal/readiness → Content/CDP → postcondition                      |
| 통제 Chrome | 합성 HTTPS 페이지의 실제 Worker → Content 내부 메시지, compiled generic schema, 26개 관찰          |
| 증거        | [관찰값·소스 및 번들 SHA-256](web-element-compatibility-audit-2026-10-11.json)                     |
| 미포함      | 승인 UI와 Provider를 거친 전체 Act, 원래 비용 사이트, live Provider, cross-origin frame 실험, 배포 |

표준의 패턴 범위는 [W3C APG 목록](https://www.w3.org/WAI/ARIA/apg/patterns/)과
[HTML input 타입](https://html.spec.whatwg.org/multipage/input.html#states-of-the-type-attribute)을
대조했다. ARIA 역할은 브라우저가 자동으로 구현해 주는 동작이 아니므로, 역할 이름만으로
클릭·키보드·검증 지원을 확정할 수 없다.
[W3C의 역할과 동작 설명](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/#a-role-is-a-promise).

## 판단 기준과 소스

- **조건부 경로 있음**: 실제 tool과 executor 및 관찰 경로가 있다. 승인·정책·대상 바인딩·
  검증 계약을 충족해야 한다. 이 표만으로 모든 구현 변형이나 live 성공을 주장하지 않는다.
- **불일치**: 도구 후보로 제공되지만 대상 구현이나 상태 검증을 실행 경로가 수용하지 못한다.
- **읽기 중심**: 구조·텍스트·데이터 관찰이 있으며 해당 컴포넌트 조작을 일반 지원하지 않는다.
- **미지원**: 필요한 역할·조작·검증 경로가 없거나 현재 계약에서 의도적으로 제한된다.

| 경로           | 소스와 제약                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 실제 DOM 수집  | [Content entry](../../extension/src/content/entry.ts), `roleFor`, `projectionNodes`, `hiddenReasonFor`; 17개 role, 최대 DOM 12,000 / candidate 1,500 / node 1,000                                                               |
| snapshot 계약  | [Role](../../extension/src/contracts/core-types.ts), [SemanticState](../../extension/src/contracts/semantic-types.ts); checked/selected/expanded/disabled/required 중심, pressed/mixed/numeric value 없음                       |
| Provider 후보  | [page-derived-actions](../../extension/src/service-worker/page-derived-actions.ts), [act-tools](../../extension/src/service-worker/act-tools.ts); role와 visible/enabled 중심                                                   |
| 실행 inventory | [act-execution-inventory](../../extension/src/service-worker/act-execution-inventory.ts); 제공한 schema에 `supported=true`를 붙이며 실제 대상별 executor 지원을 검사하지 않음                                                   |
| 실행 경로      | [act-execution-runtime](../../extension/src/service-worker/act-execution-runtime.ts); click/text/key는 bounded CDP, checked/select/navigation은 Content                                                                         |
| trusted input  | [bounded-adapter](../../extension/src/cdp/bounded-adapter.ts), Content `actionableRef`; ref/token/permission/visibility/hit-test, top frame 제한                                                                                |
| 결과 판단      | [readiness](../../extension/src/service-worker/act-proposal-readiness.ts), [verifier](../../extension/src/service-worker/act-postcondition-verifier.ts), [UI observer](../../extension/src/content/ui-completion.ts)            |
| 컴포넌트 읽기  | [component resources](../../extension/src/content/component-resources.ts), [observation](../../extension/src/content/component-observation.ts), [Provider schema](../../extension/src/service-worker/component-tool-schemas.ts) |

`all_dom`도 모든 DOM·native accessibility tree를 의미하지 않는다. bounded DOM/ARIA
projection이며 shadow/frame을 재귀 방문하지 않는다. [standalone collector](../../extension/src/content/semantic-collector.ts)와
[executePrimitive](../../extension/src/content/executor.ts)의 추상 모델 테스트만으로 실제
Content entry의 브라우저 동작을 검증할 수 없다.

## 입력과 선택 방식

| 유형·사용 방식                                                | 현재 판단               | 근거·한계                                                                                                                                                                                             |
| ------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input[text/search/tel/url/email]`, `textarea`                | 조건부 경로 있음        | textbox → text 도구 → CDP 입력 → 실제 `.value` 비교. IME 조합·특수 에디터·폼 유효성·서버 저장까지의 성공은 별도                                                                                       |
| native checkbox/radio                                         | 조건부 경로 있음        | `.checked` 수집·실제 클릭·즉시 상태 비교. 이미 요청 상태와 같으면 오류. radio를 false로 만드는 클릭·지연 상태 반영·mixed의 일반 지원 없음                                                             |
| `button/div[role=radio/checkbox]`                             | **불일치**              | checked 도구를 제공하나 Content는 native input만 허용. `aria-checked`를 snapshot/semantic 상태에 반영하지 않음. Chrome 재현                                                                           |
| native `select` 단일 선택                                     | 조건부 경로 있음        | option label enum과 값 전달 바인딩, 정확한 option value 검사. 일반 fallback은 enabled select가 하나일 때만 제공. 같은 값은 오류                                                                       |
| 여러 `select`                                                 | 제한                    | 대상별 enum을 한 generic schema에 안전하게 묶지 못하면 도구 생략. workflow로 대상 범위를 좁히는 경로 있음                                                                                             |
| `select[multiple]` / `size>1`                                 | **불일치·단일 값 한정** | 모두 combobox로 수집. 여러 선택값의 보존·추가·해제 계약 없음. Chrome에서 multiple에도 단일 선택 도구 제공 확인                                                                                        |
| `role=listbox` 아래 visible option                            | 조건부 후보 있음        | option click schema와 CDP route 존재. generic selected 목표를 자동 구성하는 것은 tab만이므로 option의 의미 있는 선택 검증은 별도 계약이 필요. 목록 전체/다중 선택 지원 아님                           |
| custom `role=combobox`, 자동완성·portal popup                 | 부분/미지원             | generic text는 textbox에만 제공. combobox 열기·외부 listbox와 `aria-controls`/`aria-owns` 관계·active descendant 이동을 일반 지원하지 않음. native select executor를 custom combobox에 적용할 수 없음 |
| `contenteditable` without role                                | 미지원                  | projection selector에 없어서 조작 ref가 생성되지 않음. Chrome 재현                                                                                                                                    |
| `contenteditable[role=textbox]`                               | **불일치**              | text 도구와 CDP editable 준비는 가능하나 값 검증은 input/textarea만 허용해 `INVALID_ARGUMENT`. Chrome 재현                                                                                            |
| 숫자 `input[number]`                                          | 부분/미검증             | textbox로 분류되어 입력 후보는 있음. min/max/step/validity 및 spin 동작의 typed 계약 없음; 숫자 입력이 전혀 불가능하다는 뜻은 아님                                                                    |
| 날짜·시간 `date/month/week/time/datetime-local`               | 타입별 일반 지원 미검증 | checkbox/radio/password 외 input을 textbox로 일괄 분류. segmented UI·picker·정규화된 날짜값·유효성에 맞춘 경로 없음. date 분류 Chrome 확인                                                            |
| `range`, `color` picker                                       | 미지원/잘못된 후보      | 타입별 value 설정·step·포인터 조작·검증 계약 없음. range를 text 입력 후보로 제공하는 것을 Chrome 확인                                                                                                 |
| `file`, 파일 선택·업로드·drop                                 | 미지원/잘못된 후보      | 파일 접근·선택·업로드 도구 없음. native file도 textbox 입력 후보로 제공됨. 파일 작업을 범용 텍스트 입력으로 해결할 수 없음                                                                            |
| `input[button/submit/reset/image]`                            | **잘못된 분류**         | 현재 roleFor는 textbox로 처리. input button의 text 도구 제공을 Chrome 확인. submit/reset/image는 같은 소스 분기이나 실행 실험하지 않음                                                                |
| password/OTP/credential/hidden                                | 정책상 제외             | 민감 입력과 hidden은 일반 projection/자동 입력에서 제외. 지원 확대 대상으로 해석하지 않음                                                                                                             |
| `readonly`, `aria-disabled`, disabled fieldset/optgroup/inert | **후보 판정 결함**      | snapshot enabled는 주로 own native `.disabled`. readonly/ARIA disabled/fieldset 상속 차단이 후보와 일치하지 않음. 앞의 세 유형의 잘못된 도구 제공 Chrome 확인; optgroup/inert는 소스 점검 한정        |

ARIA radio의 상태 근거는 `aria-checked`이며, `tabindex=-1` 자체는 이번 native-only 거절의
원인이 아니다. [W3C Radio Group](https://www.w3.org/WAI/ARIA/apg/patterns/radio/).
custom combobox에는 입력 가능 여부와 listbox/grid/tree/dialog popup 등 여러 구현 방식이 있다.
[W3C Combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

## UI 패턴·제스처·구조

APG 패턴명을 묶어 점검했다. 개별 사이트의 CSS·JS·프레임워크 구현 조합 전부를
실행한 것은 아니다.

| 패턴·사용 방식                                             | 현재 판단             | 확인한 경계                                                                                                                                                          |
| ---------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button, Menu Button, 메뉴 열기                             | 조건부 경로 있음      | button/menuitem click. expanded 변화, 선언한 marker, 연결된 native dialog/status 변화 등 검증 근거 필요. 아무 버튼이나 성공 판정하지 않음                            |
| Toggle button                                              | 불일치                | `aria-pressed` 미수집·검증 계약 없음. 버튼 후보는 있어도 pressed 상태만 바꾸는 토글의 generic 검증 불가. Chrome 확인                                                 |
| Link, Breadcrumb                                           | 조건부 경로 있음      | 관찰한 HTTP(S) anchor navigate, fresh scope/snapshot. `a[role=menuitem]` 포함. new tab·download·mailto/tel·JS-only link의 일반 완료 지원은 없음                      |
| Accordion, Disclosure, `details/summary`                   | 조건부 경로 있음      | summary를 button으로 수집하고 details.open을 expanded로 관찰. ARIA expanded button도 검증 변화 구성 가능. Chrome에서 summary state 확인                              |
| Tabs                                                       | 조건부 경로 있음      | tab click과 `aria-selected=false→true` expected change. 키보드 탭 탐색 및 전체 tabpanel 관계의 일반 구현은 없음                                                      |
| Menu/Menubar                                               | 부분                  | menuitem과 링크 항목은 처리 경로 있음. menubar 구조, arrow 이동, menuitemcheckbox/menuitemradio의 의미와 checked는 미지원                                            |
| Dialog (Modal), Alert and Message Dialogs                  | 부분                  | native dialog open/close의 명시적 관계 지원. `role=dialog` 읽기 가능. `alertdialog` 역할·JS alert/confirm/prompt·focus trap·닫기/복귀의 일반 처리는 없음             |
| Alert, Status                                              | 읽기·조건부 완료 근거 | 명시적으로 연결된 status/alert의 새 텍스트는 local UI 변화를 확인. 업무 처리·저장·결제 성공을 자동 증명하지 않음                                                     |
| Popover                                                    | 일반 완료 경로 없음   | trigger가 button이면 후보가 될 수 있으나 `popovertarget`/`:popover-open` 전용 상태 검증 없음                                                                         |
| Switch                                                     | 역할 지원 누락        | Role enum에 switch 없음. div switch는 ref 누락 Chrome 확인. native checkbox/button 태그의 fallback 분류를 switch 지원으로 세지 않음                                  |
| Slider, Multi-Thumb Slider, Spinbutton, Window Splitter    | 미지원                | 역할·numeric state·Arrow/Home/End·bounded drag 계약 없음. native number의 텍스트 입력 경로와 별개                                                                    |
| Listbox                                                    | 부분                  | 현재 visible option 후보/읽기; keyboard selection/typeahead/multiselect 전체 패턴 지원 없음                                                                          |
| Table, Grid, Tree View, Treegrid                           | 읽기 중심             | table/grid와 현재 렌더된 tree 행 읽기. grid cell 편집·row selection·treeitem 확장·treegrid 조작 도구 없음; child button이 지원되어도 컴포넌트 전체 지원은 아님       |
| Feed, 가상 스크롤 목록·표                                  | 읽기 중심·bounded     | 승인한 collection scroll과 원래 위치 복원. 미렌더 행·닫힌 자식 전체를 읽었다고 주장하지 않음. 범용 화면 탐색 scroll 도구와 별개                                      |
| Carousel                                                   | 읽기/개별 버튼 조건부 | 자식 next/previous button 경로는 있을 수 있음. slide/index/pause/swipe/auto rotation 완료의 전용 계약 없음                                                           |
| Tooltip, hover/focus-only menu                             | 미지원                | hover/focus 독립 mutation schema 없음. 표시된 텍스트를 읽는 것과 필요 gesture 실행은 별개                                                                            |
| Toolbar                                                    | 자식 컨트롤 부분      | 컨테이너/roving focus/shortcut 계약 없음. 지원된 button 등의 자식만 개별 처리 가능                                                                                   |
| Landmarks, Meter                                           | 읽기 부분             | 명시적 main/navigation/form 등만 semantic node. 나머지 landmark/meter role·numeric state 없음. 텍스트/컴포넌트 읽기는 가능할 수 있음                                 |
| Enter/Space/Escape                                         | 선언된 경우에 한정    | Profile action contract에는 있으나 page-derived fallback은 key 도구를 생성하지 않음. 표준 Space 이벤트 표현과 전체 keyboard 동작은 이번 runtime 미검증               |
| Arrow/Tab/Home/End/PageUp/PageDown, modifier               | 미지원                | action/Provider key enum은 Enter/Space/Escape. CDP 내부에 Tab가 있어도 Provider·parser·intent 경로에 없어 end-to-end 지원으로 세지 않음                              |
| drag/drop, double/right click, touch, pointer-only control | 미지원                | generic mutation 도구는 text/select/checked/click/key/navigate 6종. CDP left single click 경로만 있음                                                                |
| open/closed Shadow DOM, Web Components                     | 내부 조작 미지원      | DOM walker가 shadow root를 순회하지 않고 CDP도 `pierce=false`. open shadow button ref 누락 Chrome 확인; closed는 소스 점검                                           |
| same/cross-origin iframe                                   | 내부 조작 미지원      | content script all_frames 없음, 등록·CDP는 frame 0에 제한. same-origin srcdoc ref 누락 Chrome 확인; cross-origin은 실제 검사 미포함                                  |
| SVG, Canvas, Chart, Image                                  | 읽기 중심             | description/visible text/명시적 alt table/승인 vision. pixel을 action ref나 정확한 chart 값으로 전환하지 않음; SVG rolebutton은 HTMLElement executor와 일치하지 않음 |
| 의미 정보 없는 div onclick, JS-only widget                 | 미지원                | event listener 분석으로 조작을 자동 발견하지 않음. 선언된 role/안전한 action contract 없으면 후보 누락 또는 검증 불가                                                |

Toggle은 `aria-pressed`, switch는 `aria-checked`, slider는 numeric value와 방향키가 필요한
별도 패턴이다. [W3C Button](https://www.w3.org/WAI/ARIA/apg/patterns/button/),
[Switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/),
[Slider](https://www.w3.org/WAI/ARIA/apg/patterns/slider/).
frame 주입 범위는 [Chrome Content Script 설정](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#specify_frames)과
대조했으며 shadow tree는 일반 light tree와 별도다.
[WHATWG DOM](https://dom.spec.whatwg.org/#concept-shadow-tree).

## 조작 확대와 업무 완료의 경계

button으로 렌더된 Save/Submit/Delete/구매도 물리적 요소 종류는 button이다. 그렇다고
page-derived의 local-ui-only 분류와 UI 변화만으로 서버 업무 성공을 판정할 수 없다.
승인, effect/risk, authoritative 완료 계약이 별도로 필요하다. 현재 `render_result`의
authoritative generation verifier가 없으면 `UNSUPPORTED_COMPLETION`으로 dispatch 전에
차단한다. 이는 누락된 모든 기능을 임의 click/JS/좌표 도구로 우회하라는 의미가 아니다.

signed Profile/workflow는 기존 executor 안에서 target·policy·completion을 좁히는 수단이다.
누락된 role/primitive/state reader를 Profile 선언만으로 추가할 수 없다. 등록된 Page API는
검토한 adapter·option·권한·완료 조건 안의 별도 경로이며, arbitrary JS/function/argument
실행을 제공하지 않는다.

## 개선 우선순위와 이슈 추적

| 우선순위  | 작업                                                                     | 완료 판단·기록                                                                                                                                  |
| --------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| P1        | reported ARIA radio/checkbox의 실제 checked 관찰·한 번 실행·bounded 검증 | [ISS-20261011-002](../issues/records/2026-10-11-aria-radio-button-execution.md); native와 ARIA를 같은 판별로 수집·제공·실행·검증                |
| P1        | 실행 가능한 대상만 schema/inventory에 제공                               | [ISS-20261011-003](../issues/records/2026-10-11-web-control-capability-parity.md); 타입 오분류, disabled/readonly, unverifiable editor부터 정정 |
| P2        | toggle/switch/mixed, custom combobox/listbox, target별 select enum       | typed 상태·관계·실행·검증 지원을 세로로 추가. 역할 목록만 늘리면 완료되지 않음                                                                  |
| P2        | already satisfied·비동기 반영·replacement·유효성                         | fresh 상태 일치면 불필요한 mutation 없이 action 결과로 기록. 지연은 bounded read로 기다리고 실패/unknown을 보존                                 |
| P3        | shadow/frame, 숫자·날짜, keyboard/hover/drag                             | 정책·origin/document/frame binding과 기대 상태를 포함한 별도 지원 범위 결정·Chrome 회귀 후 활성화                                               |
| 별도 결정 | file/upload, business commit, canvas 좌표 조작                           | 사용자 의도·권한·authoritative 증거가 있는 별도 계약. 일반 UI 지원률을 높이려고 자동 개방하지 않음                                              |

핵심은 **공통 control capability 판별과 상태 reader를 두고 schema·executor·verifier가
같은 기준을 사용하도록 하는 것**이다. native/ARIA 유형, 지원 action, executor, 읽을 수 있는
상태, 완료 조건, 미지원 사유를 묶는다. page의 역할·declaration은 관찰/요청이며 실행 권한이
되지 않는다. 공유 판별 결과도 dispatch 직전에 document/ref·policy·disabled·visibility를
다시 확인해야 한다.

검증은 `발견 → 실제 Provider enum → 승인 → 실행 1회 → 기대 상태 → 같은 대화의 결과와
목표 판단`을 유형별로 연결한다. 성공/이미 충족/상태 불변/지연/DOM replacement/disabled/
취소/stale를 포함하고, [ISS-20261011-001](../issues/records/2026-10-11-act-completion-after-navigation.md)의
navigation 완료 회귀를 함께 유지한다. 범위 밖 요소는 제안 전에 미지원 사유를 제공해
실행 실패나 거짓 성공으로 뒤늦게 드러나지 않게 한다.

## 실행한 검사

```bash
pnpm exec vitest run \
  extension/tests/unit/service-worker/page-derived-actions.test.ts \
  extension/tests/unit/service-worker/act-tools.test.ts \
  extension/tests/unit/service-worker/act-support-matrix.test.ts \
  extension/tests/unit/service-worker/act-postcondition-verifier.test.ts \
  extension/tests/unit/content/semantic-snapshot.test.ts \
  extension/tests/unit/cdp/bounded-adapter.test.ts \
  extension/tests/unit/service-worker/component-tools.test.ts \
  extension/tests/unit/page-act-harness/pah-4-components.test.ts

CHROME_FOR_TESTING_BIN=/path/to/chrome \
WEB_ELEMENT_AUDIT_REPORT=/tmp/web-element-audit.json \
node --experimental-websocket scripts/chrome-web-element-audit.mjs
```

- 기존 unit: **8 files / 57 tests PASS**. 이 suite의 PASS는 ARIA radio 수정이나 전체 웹 지원을 뜻하지 않는다.
- Chrome: **26개 현재 상태 관찰 재현**, native checkbox 실제 선택 포함. ARIA radio/checkbox
  응답은 `TARGET_NOT_ACTIONABLE`, 실제 click counter는 각각 0. rich editor 값 검증은
  `INVALID_ARGUMENT`. 실패를 해결한 것이 아니라 현 결함을 재현했다.
- [audit runner](../../scripts/chrome-web-element-audit.mjs)와
  [checks](../../scripts/chrome-web-element-audit-checks.mjs)는 고정된 합성 페이지에서 현재
  불일치를 assert하는 수동 진단이다. 수정 시 정상 기대값의 회귀 검사로 전환하고 이 dated
  JSON은 유지한다. 제품 승인 경로를 대신하는 검사로 사용하지 않는다.
- source-size: **FAIL, 기존 86개 초과 파일**. 추가 audit 모듈은 각각 169/163줄로 제한 이내다.
- 제품 실행 코드·버전·build 변경 및 commit·배포 없음. 새 진단 script와 증거·이슈 기록만 추가했다.

## 최종 판단

일반적인 웹 사용 범위를 단계적으로 넓힐 구조는 있으나, 현재 구현을 “모든 elements 지원”으로
평가할 근거는 없다. 먼저 실행·검증 가능한 대상을 정확히 제공하도록 맞춘 뒤, 명시한 패턴별
회귀와 Chrome 증거로 지원을 확장해야 한다. 임의 사이트의 모든 JS 동작·비동기 업무 결과를
HTML/ARIA 지식만으로 자동 처리·성공 판정한다는 보장은 성립하지 않는다.
