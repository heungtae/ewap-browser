# 25. Act 완료 조건과 비동기 화면 갱신 검증

- 작성일: 2026-09-14
- 상태: Partially implemented — 전환 관측·새 scope snapshot 검증·옵션 값 일치·안전한 milestone trace는 구현됐다. Profile 목적지 marker와 비동기 결과 세대 계약은 후속 구현 항목이다.
- 범위: Browser Act의 클릭·선택·입력 뒤 완료 판정과 개발용 진단
- 비범위: WebSocket payload 해석, 네트워크 감청, 임의 JavaScript 실행, raw DOM/URL/selector의 진단 저장

## 1. 목표

`Input.dispatchMouseEvent` 또는 DOM 실행 요청이 전송됐다는 사실은 완료 증거가 아니다. 특히 클릭이 URL 전환, SPA route 변경, WebSocket 기반 비동기 렌더링 중 어느 결과를 만들지 실행 전에는 확정할 수 없다.

`VERIFIED`는 승인된 작업의 **선언된 화면 완료 조건**이 현재 페이지의 새 semantic snapshot에서 확인됐을 때만 사용한다. 서버·WebSocket·fetch 응답 수신, CDP dispatch 성공, 화면의 임의 텍스트 변화는 단독 완료 조건이 아니다.

## 2. 용어와 증거

| 용어                 | 의미                                                       | 완료 증거가 되는가  |
| -------------------- | ---------------------------------------------------------- | ------------------- |
| dispatch             | 제한된 ref에 클릭/입력 요청을 실제로 전송한 시점           | 아니오              |
| transport receipt    | WebSocket, fetch, SSE 등의 데이터가 브라우저에 도착한 사실 | 아니오              |
| render               | 도착한 데이터로 페이지 DOM이 변경된 사실                   | 단독으로는 아니오   |
| PageScope 전환       | `document_epoch` 또는 `page_scope_epoch`가 바뀐 상태       | 전환 유형 판별 증거 |
| completion predicate | 승인된 작업이 기대한 안전한 DOM 상태                       | 예                  |

페이지는 다음과 같이 분류한다.

| 유형                    | 예                                        | 완료 조건                                                   |
| ----------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| full navigation         | 링크·커스텀 옵션 클릭 뒤 다른 문서 로드   | 새 `DOCUMENT_REGISTER`, 새 snapshot, navigation predicate   |
| same-document route     | `pushState`/`replaceState` 뒤 화면 교체   | 새 `PAGE_SCOPE_REGISTER`, 새 snapshot, navigation predicate |
| same-scope state change | checkbox, native select, 탭 선택          | 같은 scope의 새 snapshot, state predicate                   |
| async render            | 클릭 뒤 WebSocket 데이터로 목록/카드 갱신 | 같은 scope의 새 snapshot, declared render predicate         |

## 3. 완료 계약

각 승인 가능한 ActionDefinition은 도구·대상·위험도와 함께 하나의 `completion_predicate`를 가져야 한다. predicate는 현재 semantic projection에서 검증 가능한 역할, 접근 가능한 이름, 허용된 상태 변화 또는 PageScope 전환으로만 표현한다.

```text
completion_predicate :=
  navigation(destination_marker)
  | state_change(target, allowed_state_change)
  | render(marker, allowed_state_change)
```

`destination_marker`와 `marker`는 역할·접근 가능한 이름·영역 관계로 구성한 제한된 semantic 식별 조건이다. 목적지 marker는 이동 전 화면에 존재할 필요는 없지만, 아래의 검증된 선언에서 유래하고 이동 후 보이는 snapshot에서 확인되어야 한다. raw selector, 임의 JavaScript, WebSocket payload 또는 민감한 필드는 조건에 포함하지 않는다.

### 3.0 생성 주체와 승인 시 고정

- 신뢰 검증을 통과한 Profile/Workflow는 기대 상태와 목적지 marker를 선언할 수 있다. 페이지 내부 선언은 자동으로 신뢰하지 않고 동일한 계약·정책 검사를 적용한다.
- Profile 없는 페이지에서는 Browser가 관측된 native control과 승인된 인수로부터 checkbox 목표값, 선택 옵션 일치 등의 제한된 조건을 생성한다. 관측된 링크는 Browser 내부에서 실제 목적지를 결합해 검증한다. URL은 모델·trace에 전달하지 않는다.
- 모델은 지원되는 조건의 후보만 제안할 수 있다. Browser가 출처, 대상 유일성, 현재 scope, 허용된 연산과 승인된 인수와의 일치를 검증한다. 모델의 완료 선언이나 임의 기대 텍스트 자체는 검증 권한이 없다.
- 생성 가능한 조건이 없으면 dispatch 전에 `TARGET_NOT_ACTIONABLE`로 종료한다. 목적지 marker가 없는 관측 링크는 정확한 목적지와 새 scope의 유효한 snapshot을 확인하는 제한된 링크 이동 조건을 사용할 수 있다. 이 경우 보고 범위는 링크 이동이며, 목적지 업무 결과 달성을 의미하지 않는다.

승인 시 조건 종류, 출처, 기대 인수, 허용 전환 유형(`navigation`, `same_scope`, `undetermined`)과 budget을 고정한다. 실행 후 관측한 결과에 맞춰 조건을 느슨하게 바꾸지 않는다. 기존 `VerifierPredicate`와의 매핑, closed schema 및 버전 호환을 구현 전에 정의해야 하며, 이 문서의 표기 자체는 이미 지원되는 API가 아니다.

### 3.1 Navigation predicate

다음 순서를 모두 만족해야 한다.

1. dispatch 직전의 탭 URL, `document_epoch`, `page_scope_epoch`를 메모리에 보관한다.
2. 클릭 뒤 같은 origin의 URL 변화 또는 새 page scope를 관찰한다. 다른 origin은 별도 승인된 `navigate` 경로가 아니면 성공으로 확정하지 않는다.
3. full navigation이면 새 `DOCUMENT_REGISTER`, SPA 전환이면 새 `PAGE_SCOPE_REGISTER`를 기다린다.
4. 원래 고정된 탭의 새 scope에서 `CONTENT_SNAPSHOT`을 다시 읽고 계약된 목적지 조건을 검증한다. marker 조건이면 marker를, 관측 링크 조건이면 정확한 목적지를 확인한다. 같은 origin의 임의 URL 변경은 충분하지 않다. redirect 허용 범위도 사전에 선언한다.
5. 1–4가 성공하면 `VERIFIED`로 종료하고 이전 ref, token, proposal, 후속 자동 실행을 폐기한다.

URL만 바뀐 상태, 새 문서만 등록된 상태, 새 snapshot만 읽힌 상태는 각각 중간 milestone이다. 목적지 조건과 scope 준비 증거를 모두 충족해야 한다. 아래 단계는 논리적 필요 조건이며 이벤트 도착 순서를 강제하지 않는다. snapshot 요청 전후 scope가 다르면 해당 응답을 폐기한다.

### 3.2 Same-scope state predicate

native select, checkbox, tab 등은 dispatch 전 기준 상태와 dispatch 후 관측에서 선언된 목표값을 비교한다. digest 변화만으로 성공을 확정하지 않는다.

- native select의 `selectedIndex >= 0`은 선택 존재 여부일 뿐이다. `max → low`처럼 양쪽 모두 선택 상태인 경우 승인된 옵션과 실제 선택 옵션이 일치하는지 Content에서 검증해야 한다. native value는 내부 일회성 결합으로만 비교하고 로그에 저장하지 않는다. 이미 목표값이면 dispatch 없이 이미 충족된 상태로 보고하며 실행했다고 표시하지 않는다.
- 커스텀 옵션은 승인한 항목의 선택 상태 또는 선언된 결과 marker로 검증한다. 메뉴 닫힘만으로 옵션 선택을 확정하지 않는다. 이동을 발생시키면 navigation 조건도 충족해야 한다.
- 상태 변경이나 DOM 교체로 기존 ref가 무효화될 수 있다. 새 snapshot에서 사전에 고정한 역할·이름·영역 관계로 유일한 대상을 다시 찾고 읽기 전용 검증에만 사용한다. 기존 ref의 실행 권한을 이전하지 않는다. 중복·누락·수집 잘림으로 식별할 수 없으면 미확인이다.

### 3.3 WebSocket/비동기 render predicate

클릭 뒤 Socket 서버가 데이터를 보내 화면을 갱신해도 extension은 WebSocket frame·payload를 읽거나 완료 근거로 저장하지 않는다. 완료는 아래 순서로만 판정한다.

```text
승인된 클릭
  → dispatch
  → Socket/fetch/SSE 등 페이지 내부 비동기 처리
  → DOM render
  → 새 semantic snapshot
  → declared render predicate 확인
  → VERIFIED
```

예를 들어 “조회 실행”은 이번 조회 결과라는 증거와 선언된 완료 marker를 함께 확인해야 한다. 이전 결과 카드와 `complete`가 그대로 남아 있는 것만으로 완료 처리하지 않는다.

dispatch 전에 결과 영역의 기준 상태와, 사이트 계약이 제공하는 비민감한 요청/결과 세대 식별을 메모리에 결합한다. dispatch 후 승인된 조회와 대응하는 새 결과 세대 및 완료 marker를 확인한다. 단순 DOM mutation 횟수는 다른 백그라운드 갱신도 포함하므로 상관관계 증거가 아니다. 세대 식별값·본문·digest 원문은 trace에 저장하지 않는다.

계약이 해당 영역의 작업별 `busy → complete` 전이를 보장하면 이를 사용할 수 있다. 짧은 busy 상태를 놓쳤을 때는 요청과 대응하는 결과 세대로 검증할 수 있으며, 둘 다 확인할 수 없으면 `UNKNOWN`이다. 관측은 dispatch 전에 설치하고 동시에 진행된 다른 작업의 결과, 이전 결과, loading placeholder를 제외한다. 같은 결과가 재출력되는 경우도 새 결과 세대로 구분한다. UI 완료 증거는 서버의 영속 저장 성공까지 보장하지 않으며, 그 보장이 필요한 작업에는 별도 authoritative verifier가 필요하다.

## 4. 실행 상태와 시간 제한

navigation 또는 undetermined 작업은 dispatch 전에 관측을 설치하고 `VERIFYING_NAVIGATION`으로 전이한다. 이는 읽기 전용 전환 검증만 유지하는 예외다. 새 scope가 관측되면 이전 ref·token·proposal 실행 권한은 즉시 무효화한다. 사용자 취소, 탭 닫힘, 새 요청에 의한 대체를 무시하는 예외로 사용하지 않는다.

ARIA 상태 변화와 navigation 관측은 병행한다. navigation 조건인 작업은 메뉴 닫힘이나 `expanded` 변화가 먼저 성공해도 완료하지 않는다. undetermined 작업은 동일 scope 상태만으로 자동 성공·후속 실행하지 않으며 선언된 전환 조건을 입증하지 못하면 `UNKNOWN`이다. 짧은 무변화 구간만으로 앞으로 이동이 없다고 단정하지 않는다. 검증 중 Provider와 다음 mutation 호출을 금지한다.

### 4.1 Deadline과 반복 관측

아래는 구현 예정 기본값이다. 기준 시각 `t0`는 dispatch 시작의 monotonic clock이며, 전체 검증 deadline은 `min(t0 + 15초, 요청의 남은 자동 실행 budget 만료 시각)`이다. 승인된 장기 조회는 신뢰된 선언으로 최대 60초까지 설정할 수 있으나 요청 전체 budget은 연장하지 않는다. 단계 시작·이벤트 수신·snapshot 재시도로 deadline을 초기화하지 않는다.

| milestone              | 기록 시점                          | 기본 한도                                    |
| ---------------------- | ---------------------------------- | -------------------------------------------- |
| `dispatch_started`     | CDP/content 요청 직전              | —                                            |
| `url_or_scope_changed` | URL 변화 또는 page scope 등록 관찰 | t0 + 4초에 지연 표시, 전체 deadline까지 관측 |
| `document_registered`  | full navigation의 새 document 등록 | t0 + 4초에 지연 표시, 전체 deadline까지 관측 |
| `snapshot_validated`   | 현재 scope snapshot schema 검증    | 1회 min(10초, 남은 검증 시간)                |
| `completion_verified`  | predicate 충족                     | 전체 VERIFY budget 안                        |

URL, 문서 등록, page scope 이벤트는 순서와 무관하게 같은 탭의 현재 등록 상태에 누적한다. 이벤트를 놓친 경우에도 현재 등록 상태를 조회해 조정한다. snapshot은 최대 하나만 진행하고, 응답 후 200ms 간격으로 필요한 읽기만 반복한다. 전환 중 일시적인 미등록·응답 단절은 deadline 안에서 재관측하며 schema·소유권 위반을 정상 대기로 숨기지 않는다. 반복되는 marker 불충족은 busy loop나 중복 로그를 만들지 않는다.

dispatch 뒤 조건을 증명하지 못하면 `UNKNOWN`으로 끝내며 mutation 자동 재시도·후속 Provider 호출·이전 ref 재사용을 하지 않는다. 검증용 읽기 재시도는 mutation 재실행과 구분한다. dispatch 전 오류는 `FAILED`다. 사용자 취소는 `CANCELLED`로 종료하되 이미 발생했을 수 있는 효과와 미확인 여부를 보존하고 롤백을 의미하지 않는다. Worker 재시작 후 실행 증거만 남으면 `UNKNOWN`이며 재실행하지 않는다.

모든 비동기 응답은 request/run ID와 실행 generation을 검사한다. terminal은 한 번만 확정하고 관측자·timer를 정리한다. 취소·대체·deadline 뒤 늦은 snapshot이나 Provider 응답은 결과를 덮어쓰거나 새 실행을 만들 수 없다.

## 5. 후속 처리 규칙

navigation predicate가 성공한 Action은 도구 이름이 `click_by_ref`여도 `navigate`와 동일하게 session을 종료한다. 새 페이지에서 추가 조사가 필요하면 새 PageScope와 새 요청으로 시작한다.

same-scope state/render predicate가 성공한 뒤에만, 승인 범위와 정책이 허용하는 경우 다음 Act step을 시작할 수 있다. 이전 action의 `tool_finished`만으로 다음 Provider 호출을 시작하면 안 된다.

## 6. 진단과 개인정보 경계

개발용 trace는 각 milestone의 `elapsed_ms`, `duration_ms`, stage, outcome, 등록된 code만 기록한다. URL, DOM/HTML, ref, selector, 접근 가능한 이름, WebSocket payload, fetch body, 인증정보는 기록하지 않는다.

[24번 진단 설계](24-act-liveness-and-diagnostics-design.md)의 request/run/span 상관관계를 유지한다. 검증 종류, 조건 충족 여부, 실패한 milestone은 closed enum/boolean으로 추가하고 validator·UI를 함께 정의한다. dispatch 시점부터 각 관측까지의 시간과 최종 검증 시간을 구분한다. Worker 재시작을 가로질러 monotonic 시간을 빼지 않으며 누락된 시점을 추정값으로 채우지 않는다.

이 정보로 다음을 구분할 수 있어야 한다.

- dispatch가 발생하지 않음
- dispatch 뒤 URL/page scope 변화가 없음
- 전환은 발생했으나 새 문서 등록이 없음
- 등록은 됐으나 새 snapshot 검증 실패
- snapshot은 유효하지만 completion predicate 불충족
- predicate 충족 후 terminal 발행 실패

## 7. 필수 검증 시나리오

| ID          | 시나리오                                           | 기대 결과                                                              |
| ----------- | -------------------------------------------------- | ---------------------------------------------------------------------- |
| COMPLETE-01 | 같은 origin full navigation                        | 새 document·snapshot·marker 뒤 VERIFIED, session 종료                  |
| COMPLETE-02 | SPA history 전환                                   | 새 page scope·snapshot·marker 뒤 VERIFIED, session 종료                |
| COMPLETE-03 | URL은 바뀌나 destination marker 없음               | UNKNOWN, 자동 재시도 없음                                              |
| COMPLETE-04 | native select 상태 변경                            | 선언된 selected state 뒤 VERIFIED                                      |
| COMPLETE-05 | Socket 수신 후 DOM 미반영                          | UNKNOWN, payload만으로 성공 처리 금지                                  |
| COMPLETE-06 | Socket 수신 후 선언된 결과 marker 렌더             | VERIFIED                                                               |
| COMPLETE-07 | 임의 데이터 변화만 발생                            | UNKNOWN                                                                |
| COMPLETE-08 | 새 문서 등록 중 이전 run 취소 경쟁                 | VERIFYING_NAVIGATION run은 새 snapshot 판정까지 유지                   |
| COMPLETE-09 | cross-origin 클릭                                  | 별도 navigate 승인·검증 없이는 VERIFIED 금지                           |
| COMPLETE-10 | milestone trace 내보내기                           | 시간 정보는 남고 URL·payload·DOM은 없음                                |
| COMPLETE-11 | Profile 없는 일반 페이지, 조건 생성 불가           | dispatch 전 거절; 모델이 임의 조건을 생성해 우회하지 않음              |
| COMPLETE-12 | native select max → low 및 잘못된 옵션 선택        | low 일치만 VERIFIED; selected=true만으로 성공 금지                     |
| COMPLETE-13 | DOM 교체로 ref 변경, 같은 이름의 복수 대상         | 유일한 새 대상만 읽기 검증; 모호하면 UNKNOWN                           |
| COMPLETE-14 | 메뉴 닫힘 뒤 지연된 URL 전환                       | 상태 변화로 조기 완료하지 않고 전환 조건 검증; 중간 Provider 호출 없음 |
| COMPLETE-15 | 이전 complete 카드 유지 또는 다른 작업의 결과 도착 | 이번 요청의 결과 세대 없으면 UNKNOWN                                   |
| COMPLETE-16 | busy 상태를 놓친 빠른 응답 또는 동일 결과 재조회   | 요청과 대응하는 새 결과 세대로 검증; 증거 없으면 UNKNOWN               |
| COMPLETE-17 | document 등록이 URL 이벤트보다 먼저 도착           | 이벤트 순서에 무관하게 현재 scope 확인                                 |
| COMPLETE-18 | 늦은 렌더링과 반복 snapshot 실패                   | deadline 재설정 없음; 지연 안내 후 제한 시간 내 검증 또는 UNKNOWN      |
| COMPLETE-19 | 취소·탭 닫힘·새 요청 뒤 늦은 응답                  | terminal 유지, 후속 실행·중복 terminal 없음                            |
| COMPLETE-20 | marker 없는 관측 링크 이동                         | 정확한 승인 목적지와 새 snapshot 확인; 링크 이동 범위로 보고           |

## 8. 현재 구현과 후속 작업

현재 Browser는 다음을 구현했다.

- 상태 변화를 선언하지 않은 bounded click은 dispatch 전에 `VERIFYING_NAVIGATION`으로 전이하고, URL·document/page scope 기준값도 같은 시점에 고정한다. 따라서 새 document/page scope 등록과의 경쟁으로 run이 먼저 취소되거나 빠른 SPA 전환의 이전 scope를 놓치지 않는다.
- 같은 origin URL 또는 scope 전환을 관찰한 뒤, 현재 등록 scope와 일치하는 새 semantic snapshot을 다시 읽어야 navigation 결과를 `VERIFIED`로 확정한다. URL 변화만으로는 완료하지 않는다.
- generic menu trigger는 `expanded: false → true`를 고정 same-scope 조건으로 사용한다. 반면 선언된 상태 조건이 없는 custom option click은 임의 digest 변화로 성공시키지 않고 전환 snapshot을 요구한다.
- native select는 Content에서 승인한 option의 실제 value와 선택 결과를 직접 비교한다. `selectedIndex >= 0` boolean은 완료 판정에 사용하지 않는다.
- trace에는 `DISPATCH_STARTED`, `URL_OR_SCOPE_CHANGED`, `SNAPSHOT_VALIDATED`, `COMPLETION_VERIFIED`라는 closed milestone만 추가한다. URL·DOM·ref·payload는 저장하지 않는다.

아직 구현하지 않은 것은 Profile/Workflow가 선언하는 목적지 marker의 재식별, WebSocket/비동기 조회의 요청·결과 세대 상관관계, 그리고 결과 marker 기반의 render predicate다. 이 항목은 semantic snapshot의 boolean 상태만으로 표현할 수 없으므로 별도 closed evidence 계약과 실제 Chrome 재현을 추가한 뒤 구현한다.

이번 구현은 단위 검증으로 `COMPLETE-01`의 scope/snapshot 전제, `COMPLETE-10`의 milestone trace, `COMPLETE-12`의 옵션 값 일치, `COMPLETE-14`의 dispatch 전 전이를 다룬다. `COMPLETE-02`부터 `COMPLETE-20`의 나머지는 제어된 fixture와 실제 Chrome에서 별도 증거를 남겨야 하며, 회사 Provider 및 보고된 사이트 재현은 단위 테스트로 대체하지 않는다.
