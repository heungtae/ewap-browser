# 26. 화면 변경 후 Act 결과 미확인 개선 설계

- 작성일: 2026-09-15
- 상태: Partially implemented — v2 closed schema, v2 control/UI 조건의 승인 결합, 실행 전 조건 거절, 고정 탭 반복 관측·DOM 교체 재식별, 검증 상태·원인 구분, 패널 terminal 중복 억제까지 구현됐다. `render_result`의 사이트별 결과 세대 계약과 보고 사이트의 실제 Chrome 재현은 후속 검증 항목이다.
- 배경: 25번 적용 후에도 Web UI는 변경되지만 “작업 결과를 확인할 수 없습니다”가 반복된다는 사용자 보고.
- 관계: [25번 완료 조건](25-act-completion-conditions.md)의 후속 설계다. 완료 증거 원칙은 유지하고, 현재 구현의 검증 경로·관측 계약·오류 분류를 구체화한다.

## 1. 판단과 확인 범위

현재 구현에는 **화면 내부 변경을 일으키는 일반 클릭을 페이지 이동으로만 검증하는 경로**가 있다. 따라서 25번의 전환 관측 개선만으로 모든 클릭의 미확인을 해결할 수 없다. 지연 상태 변경과 DOM 교체도 별도 미확인 원인이 될 수 있다.

다만 보고된 사이트의 실행 trace와 로드된 확장 build를 확인하지 않았으므로, 아래는 코드에서 확인한 구조적 문제이며 해당 실행의 확정 원인은 아니다. 패널의 동일한 제목은 여러 오류에서 공통으로 사용되므로 제목만으로 `POSTCONDITION_UNVERIFIED`라고 단정하지 않는다.

| 현재 코드 근거                                                        | 확인한 동작                                                                                                 | 결과                                                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `service-worker/page-derived-actions.ts`, `act-proposal-readiness.ts` | 일반 클릭은 빈 `required_changes`로 생성되고, `expanded=false`인 경우에만 메뉴 열림 조건을 보충             | 일반 버튼·탭·커스텀 옵션에 명시적 완료 조건이 없을 수 있음                             |
| `service-worker/act-execution-runtime.ts`의 `executeBounded`          | 빈 조건의 클릭은 `undeterminedClick`으로 분류되어, 실행 전 URL이 있으면 `waitForPageTransition` 결과로 종료 | 같은 URL/scope의 모달·목록 갱신은 검증 대상에 들어가지 못함                            |
| `service-worker/act-postcondition-verifier.ts`의 `semantic`           | snapshot을 한 번 읽고 기존 `ref_id`로 대상을 찾음                                                           | 늦은 상태 반영 또는 DOM 교체 후 새 ref를 놓침                                          |
| 같은 파일의 `semantic`, `bounded`                                     | 예외·대상 없음·조건 불충족을 모두 `false`로 축약                                                            | 실패 원인에 따른 대기·종료·안내를 선택하기 어려움                                      |
| `service-worker/runtime-execution.ts`                                 | 검증 읽기가 `readActiveSnapshot("all_dom")`에 연결됨                                                        | 실행 탭 전용 읽기와 보이는 결과 판정 계약을 명시해야 함                                |
| `contracts/action-types.ts`, `semantic-types.ts`                      | 현재 상태 predicate는 boolean 상태 중심이며 snapshot에 결과 세대 계약이 없음                                | 비동기 조회 완료·결과 영역 관계를 충분히 표현하지 못함                                 |
| `sidepanel/entry.ts`의 `showFailure`                                  | 여러 오류에 같은 제목을 사용하고 카드를 추가                                                                | 실행 실패와 실행 후 미확인을 제목으로 구분하지 못함. 중복 이벤트 여부는 별도 재현 필요 |

25번의 “조건 생성 불가 시 dispatch 전 거절”은 현재 빈 조건 클릭의 실행 경로와 일치하지 않는다. 이 간극도 구현 항목으로 명시한다.

## 2. 설계 결정

완료 조건의 선택과 관측을 분리한다. 클릭이라는 도구 이름이나 빈 조건으로 navigation을 추론하지 않는다. 실행 전에 검증 가능한 계약을 확정하고, 실행 후에는 그 계약의 증거를 제한 시간 동안 읽는다.

```text
행동 후보 → 완료 계약 생성·검증 → 승인 시 고정
        → 관측 준비·기준 상태 결합 → dispatch 1회
        → 고정 탭의 새 증거 반복 관측 → 계약 평가 → terminal 1회
```

화면 변화 관측과 목표 달성은 서로 다른 정보다. DOM 변화 또는 screenshot 차이만으로 `VERIFIED`를 만들지 않는다. 계약을 생성할 수 없는 경우 실행 전에 지원 한계를 알린다. 이는 모든 임의 웹페이지 작업을 자동 검증할 수 있다는 약속이 아니다.

## 3. 완료 계약 v2

v2 closed schema는 Profile validator, ActionDefinition, ActionIntent, 승인 결합에 구현됐다. `control_state`는 실행 가능하고, `ui_relation`은 실행 전 marker 부재와 실행 후 유일 marker를 확인한다. navigation은 기존 Browser 내부 정확한 목적지·새 scope 검증 경로를 유지한다. `render_result` schema는 수용하지만 요청·결과 세대 evidence가 없는 Profile은 실행 전 거절한다.

| 필드           | 계약                                                                  |
| -------------- | --------------------------------------------------------------------- |
| `version`      | `2`                                                                   |
| `kind`         | `control_state`, `ui_relation`, `navigation`, `render_result` 중 하나 |
| `source`       | `browser_derived`, `trusted_profile` 중 하나                          |
| `subject`      | 관측 대상의 역할·이름·영역 관계를 결합한 메모리 내 식별 조건          |
| `expected`     | 종류별 허용 상태, 목적지, 결과 조건. 임의 코드·selector 금지          |
| `scope_policy` | `same_scope`, `navigation`, `declared_alternatives`                   |
| `budget_ms`    | 승인 시 고정한 전체 검증 한도                                         |
| `report_scope` | `control`, `ui`, `navigation`, `result` — 성공 안내 범위              |

`declared_alternatives`는 신뢰 검증된 계약이 이동/화면 갱신 각각의 충분한 완료 조건을 사전에 선언한 경우에만 허용한다. 실행 후 결과에 맞춰 조건을 추가하지 않는다. 메뉴 닫힘·임의 상태 변화는 navigation 대안이 아니다.

### 3.1 일반 페이지에서 생성 가능한 조건

- checkbox/radio/native select/text 입력: 승인 인수와 실제 목표 상태의 일치. 입력값은 Content 내부에서 비교하고 외부에는 일치 여부만 반환한다.
- 메뉴: 관측된 trigger의 `expanded=true` 등 제어 상태. 보고 범위는 메뉴 열림이다.
- 탭: 관측된 선택 상태와 검증된 제어 관계로 식별한 panel 표시. 관계가 projection에 없으면 Content의 제한된 관계 추출을 추가해야 하며 이름만으로 추측하지 않는다.
- 모달 열림/닫힘: 실행 전 검증된 제어 관계 또는 신뢰된 Profile의 목적 marker가 필요하다. 결과로 임의 dialog가 생겼다는 사실만 사용하지 않는다.
- 링크: Browser 내부에 결합한 정확한 목적지와 새 scope의 snapshot. URL은 모델·진단에 전달하지 않는다.
- 조회·저장·임의 버튼: 관계/결과 계약이 없으면 `UNSUPPORTED_COMPLETION`이라는 내부 reason으로 dispatch 전 종료한다. 공개 오류 코드는 계약 개정 시 확정하며 기존 `TARGET_NOT_ACTIONABLE`과 호환 매핑한다.

모델은 후보를 제안할 수 있으나 Browser가 관측·신뢰 출처·대상 유일성·승인 인수와의 일치를 검증한다. 기존 빈 predicate는 자동으로 v2 navigation으로 변환하지 않는다. 변환할 충분한 증거가 없으면 실행을 막는다.

### 3.2 비동기 결과

`render_result`는 결과 영역, 이번 실행과 대응하는 결과 세대, 완료 marker를 요구한다. 현재 semantic snapshot에 없는 세대와 busy 증거는 버전이 있는 별도 Content evidence 계약으로 제공한다.

Profile은 수집할 제한된 상태·관계와 상관관계 방식을 선언한다. Content는 허용된 DOM/ARIA 관측으로만 증거를 수집하며 임의 JS·네트워크 payload를 사용하지 않는다. 페이지의 선언만으로 신뢰된 Profile을 대신하지 않는다.

실행 전 관측을 준비하고 baseline을 잡는다. 작업별 상관관계가 보장된 `busy → complete` 또는 이번 요청과 결합된 새 결과 세대와 완료 marker를 사용한다. 같은 내용의 재조회도 세대로 구별한다. 다른 작업의 갱신·남아 있는 이전 완료 marker는 제외한다. 이런 증거가 없는 사이트는 결과 완료 검증을 지원하지 않는 것으로 명시한다. UI 결과 검증은 서버 영속 저장 성공을 보장하지 않는다.

## 4. 관측과 판정

### 4.1 고정 탭·scope·대상

`readSnapshotForRun`에 tab/frame/document/page scope 및 request/run/generation을 명시한다. 활성 탭 변경이 검증 대상을 바꾸지 않는다. 기존 읽기 경로의 권한·sender 검증을 유지한다.

snapshot 요청 전후 등록 scope가 다르면 응답을 폐기하고 다시 읽는다. 응답에는 검증 가능한 page scope 결합을 추가한다. `all_dom`을 사용하더라도 완료 marker는 visible이어야 한다. 필요한 영역의 수집이 잘렸다면 marker 부재를 확정하지 않는다.

DOM 교체 시 사전에 고정한 semantic 식별 조건으로 읽기 대상만 다시 찾는다. 유일한 후보가 없으면 `TARGET_MISSING` 또는 `TARGET_AMBIGUOUS`다. 새 ref에 기존 실행 권한을 이전하지 않는다.

### 4.2 구조화된 평가 결과

boolean 대신 아래 판정을 반환한다. 내부 reason은 closed enum으로 검증하며 공개 오류와 구분한다.

| 판정           | 예시 reason                                                                                | 처리                                                 |
| -------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `satisfied`    | `EXPECTED_STATE_MATCHED`, `RESULT_GENERATION_MATCHED`                                      | 완료                                                 |
| `pending`      | `EXPECTED_STATE_PENDING`, `TARGET_MISSING`, `SCOPE_NOT_READY`, `RESULT_GENERATION_PENDING` | 남은 시간 내 읽기 반복                               |
| `inconclusive` | `TARGET_AMBIGUOUS`, `SNAPSHOT_TRUNCATED`                                                   | 재관측으로 해소 가능한 경우만 제한 시간 내 읽기 반복 |
| `invalid`      | `CONTRACT_INVALID`, `OWNERSHIP_MISMATCH`, `SCHEMA_INVALID`                                 | 즉시 관측 종료; dispatch 후라면 UNKNOWN              |

관측 시도별 `pending`은 UI 오류가 아니다. deadline에서 마지막 reason과 `VERIFY_DEADLINE_EXCEEDED`를 보존한다. transient read 오류와 schema/권한 오류를 구분한다.

### 4.3 시간과 생명주기

- 공통 `VERIFYING_RESULT` 아래에서 state/navigation/render 관측을 계약에 따라 수행한다. 기존 `VERIFYING_NAVIGATION`의 scope 전환 보호를 일반화하되 이전 mutation 권한은 즉시 폐기한다.
- deadline은 dispatch 시작 monotonic clock 기준 기본 15초, 신뢰된 장기 계약은 최대 60초이며 요청 잔여 budget과 최솟값을 사용한다.
- snapshot은 동시에 하나, 응답 후 200ms 간격이다. 각 요청에도 남은 시간 이하의 timeout을 적용한다. 단계별 timeout을 더하거나 재시작하지 않는다.
- UI 상태 변화는 반복 관측한다. navigation은 전환 후에도 현재 origin·정확한 목적지·scope와 marker를 최종 증거 시점에 다시 검사한다. 과거 전환 플래그만으로 성공하지 않는다.
- 취소·탭 닫힘·새 요청 대체·Worker 재시작의 기존 terminal 규칙을 유지한다. 늦은 응답은 generation 검사로 폐기한다.
- 관측 중 Provider·mutation 후속 호출을 금지한다. VERIFIED일 때만 기존 승인·정책 범위의 후속 처리를 허용하며 navigation이면 session을 종료한다.
- UNKNOWN은 mutation 재실행으로 복구하지 않는다. 사용자가 결과 재확인을 요청하면 유효한 계약이 남은 경우 읽기만 수행한다. terminal을 다시 쓰지 않고 별도의 재확인 결과로 보고한다. 계약이 사라졌으면 현재 화면 설명만 제공한다.

## 5. 사용자 안내와 진단

실행 상태와 검증 상태를 분리해 전달한다. 확인 대기는 기존 질문/실행 버튼 바로 위의 단일 activity status를 갱신하고 완료 시 숨긴다.

| 상황                   | 안내 예시                                                                     |
| ---------------------- | ----------------------------------------------------------------------------- |
| 검증 대기              | 화면에 결과가 반영되는지 확인 중입니다.                                       |
| 실행 전 조건 생성 불가 | 이 작업의 완료 조건을 확인할 수 없어 실행하지 않았습니다.                     |
| dispatch 후 증거 부족  | 작업을 실행했지만 완료 여부는 확인하지 못했습니다. 현재 화면을 확인해 주세요. |
| dispatch 자체가 불명확 | 작업이 실행되었을 수 있으나 결과를 확인하지 못했습니다.                       |
| 제어 상태만 검증 성공  | 메뉴를 열었습니다.                                                            |

확인이 끝난 요청에는 request/run/action 식별자로 terminal 표시를 한 번만 적용한다. 응답·실시간 이벤트·복구 이벤트가 같은 결과를 전달해도 새 오류 카드를 중복 생성하지 않는다. 현재 증상의 “반복”이 여러 요청인지 동일 요청의 중복 표시인지는 재현 시 구분한다.

[24번 진단 계약](24-act-liveness-and-diagnostics-design.md)에 build/version, contract kind/source, dispatch 상태, 관측 횟수, scope 전환 여부, 재식별 결과, 마지막 reason, elapsed_ms를 추가한다. page/ref/URL/이름/입력값/결과 세대 원문/digest/본문은 trace에 저장하지 않는다. 식별 조건과 비교값은 승인된 메모리 수명 안에서만 유지한다.

## 6. 구현 순서와 완료 기준

구현한 항목은 다음과 같다.

1. v2 타입·validator·승인 결합과 빈 조건 click의 dispatch 전 거절.
2. 고정 탭 snapshot, 15초 단일 deadline, 200ms 반복 관측, 구조화된 평가, 유일한 semantic 재식별.
3. Profile UI marker의 실행 전 baseline과 실행 후 유일 marker 검증.
4. `VERIFYING_RESULT` 단일 패널 상태, 오류 제목 구분, 동일 terminal의 중복 오류 카드 억제.

남은 항목은 보고 사이트의 build/trace 재현, 사이트별 `render_result` 결과 세대 evidence, rebuild·unpacked extension reload 뒤 실제 Chrome 검증이다. fixture와 단위 테스트는 이 재현을 대신하지 않는다.

| 필수 사례                                              | 기대 결과                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| 같은 URL/scope에서 계약된 모달·탭·목록 표시            | 해당 ui/render 조건으로 VERIFIED; navigation 대기 강제 없음 |
| 상태가 1초/8초 뒤 반영                                 | deadline 안에서 반복 관측 후 VERIFIED                       |
| DOM 교체로 ref 변경 / 같은 이름 복수 후보              | 유일한 재식별만 성공 / 모호하면 UNKNOWN                     |
| 탭 전환 중 검증                                        | 원래 실행 탭만 관측                                         |
| scope가 snapshot 도중 변경 / 숨겨진 marker / 잘린 영역 | 해당 증거로 조기 성공하지 않음                              |
| 메뉴 닫힘 후 지연 navigation                           | 계약된 목적지까지 확인; 메뉴 닫힘으로 조기 성공 금지        |
| 이전 결과 유지 / 타 작업 갱신 / 같은 내용 재조회       | 이번 실행의 결과 세대와 marker가 있는 경우만 성공           |
| 조건 없는 일반 버튼                                    | dispatch 0회, 지원 한계 안내                                |
| timeout·취소·늦은 응답·Worker 재시작                   | mutation 최대 1회, terminal 최대 1회, 자동 재실행 없음      |
| 동일 terminal의 응답·이벤트·복구 중복 전달             | 결과 표시 1회                                               |

완료 보고에는 실제 사이트에서 확인한 결과 범위(control/UI/navigation/result), 사용한 증거 종류, 로드 build를 명시한다. “화면이 바뀌었다” 또는 단위 테스트 통과만으로 사용자 보고가 해결됐다고 선언하지 않는다.
