# ISS-20261011-002: button 기반 ARIA radio 선택 실행 거절

## 관리 정보

| 항목                 | 값                                                                      |
| -------------------- | ----------------------------------------------------------------------- |
| 상태                 | 검증 중                                                                 |
| 발생일·최근 갱신     | 2026-10-11 KST                                                          |
| 발생 버전            | 진단 manifest `0.1.100`                                                 |
| 발생 source revision | 번들에 commit 정보가 없어 미확인                                        |
| 분석 source          | HEAD `549ebacc76b5608d80ca70ab71610da11bbc29f0` + 현재 미커밋 작업 트리 |
| 요청 ID              | `39ded12f-1ca4-4fa7-98b8-7cb632dcd4e1`                                  |
| 영향 범위            | ARIA radio/checkbox의 도구 제공·Content 실행·checked 상태 검증          |
| 수정 commit·배포     | 코드 수정·통제 Chrome 검증 완료, 미커밋·미배포                          |
| 다음 작업            | 원래 사이트·Provider 확인, replacement 읽기 재식별 및 배포 검증         |

## 증상과 근거

사용자는 `$500` 항목 선택 실패를 보고했다. 제공한 대상은 텍스트가 `500`인
`button[type=button][role=radio]`이며 `aria-checked=false`, `data-state=off`,
`tabindex=-1`이다. native `input[type=radio]`가 아니다.

진단 원본은 로컬 Downloads의
`contextpilot-diagnostics-2026-10-11T01-46-13-39ded12f-1ca4-4fa7-98b8-7cb632dcd4e1.zip`이다.
manifest에 기록된 9개 파일의 길이·base64url SHA-256이 모두 일치했다. 원본은 저장소에 넣지 않는다.

| 증거                                   | 결과                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------ |
| request의 ACTION_REVIEW 결과·실행 근거 | `set_checked_by_ref` 사용                                                |
| worker method sequence 40689           | Content 메시지 응답 `ok=false / TARGET_NOT_ACTIONABLE`                   |
| worker method sequence 40738           | `executeContent`가 같은 거절 결과 반환                                   |
| 최종 completion                        | `action_outcome=FAILED`, `goal_status=unknown`, `reason=VERIFIER_FAILED` |
| request 최종 상태                      | `UNKNOWN / TARGET_NOT_ACTIONABLE`, 시작 후 16.150초                      |
| panel-failures                         | `TARGET_NOT_ACTIONABLE` 표시                                             |

`dispatch_started=true`는 Worker의 실행 메시지 전달을 의미한다. 실제 DOM 클릭이
일어났다는 근거는 아니다. target 이름·argument가 마스킹되어 진단만으로 원래 DOM
identity를 복원할 수 없다. 사용자 제공 DOM은 아래 native-only 거절 조건에 확실히 해당한다.
worker/content trace는 각각 dropped_count 64917/482512로 일부 유실되어 있다.

## 원인

1. [도구 선택](../../../extension/src/service-worker/page-derived-actions.ts)은
   visible/enabled `radio` 역할에 `set_checked_by_ref`를 제공한다. native input과
   button 기반 ARIA radio를 구분하지 않는다.
2. [Content 실행](../../../extension/src/content/entry.ts)은 `set_checked_by_ref`에
   `HTMLInputElement`와 input type radio/checkbox를 요구한다. 제공한 button은 이
   검사에서 거절되며 그 아래 `element.click()`에 도달할 수 없다.
3. 같은 Content의 snapshot 및 semantic 검증 상태 생성도 `checked`를 native input의
   `.checked`에서만 읽는다. `aria-checked`는 checked 상태로 투영하지 않는다.
   native-only guard만 제거하면 실제 선택을 검증할 수 없어 별도 문제가 남는다.

`tabindex=-1`은 이 거절 guard의 원인이 아니다. ARIA radio의 roving tabindex와
DOM 클릭 가능 여부는 별개다. `data-state`와 CSS class는 authoritative 선택 검증
근거로 사용하지 않는다.

[ISS-20261011-001](2026-10-11-act-completion-after-navigation.md)은 검증된 이동 이후
목표 최신성 판단 문제다. 이번 기록은 실행 메시지 자체의 typed 실패를 보존하고 있으므로
동일 원인의 재발로 합치지 않는다.

## 수정 방향과 진행

[Browser Act S21](../../sprints/s21-act-evidence-based-llm-assessment.md)의 C2~C4/R2에
실제 dispatch 근거·요소 예외 판단·checked 실행·완료 확인을 연결했다. 현재 지원 가능한
경로는 그대로 사용하며, 불명확한 경우에만 현재 자료를 모아 LLM에 추가 판단을 요청한다.
Sprint는 Planned이다. 아래 bounded checked 수정은 먼저 구현했으며, 전체 완료 조건의 남은 범위는 유지한다.

- [x] native input과 지원할 ARIA checked 컨트롤의 판별·상태 읽기를 공통 함수로 모은다.
      현재 보고된 button role radio부터 bounded 지원 범위를 명시한다. 미지원 역할/태그나
      checked 상태가 없는 대상은 모델 도구 enum에서 제외해 실행 가능성을 과장하지 않는다.
- [x] snapshot과 semantic 검증이 같은 기준으로 native `.checked` 또는 boolean
      `aria-checked`를 읽는다. mixed/잘못된 ARIA 값은 임의의 false로 변환하지 않는다.
- [x] 승인·document/ref·scope·visibility·disabled 검사를 유지하고 기존 대상에 클릭을
      한 번 수행한다. aria 속성을 직접 덮어쓰거나 강제 선택·자동 반복하지 않는다.
- [ ] 클릭 후 실제 checked 상태가 요청값에 도달하는지 bounded 관찰로 확인한다.
      React의 지연 상태 반영, DOM replacement, 이미 선택됨, radio의 false 요청을 구분한다.
- [ ] 관련 이전 이슈 회귀 및 실제 사이트·Provider 검증 후 목록 상태·증거를 갱신한다.

## 회귀 조건

| ID  | 조건                                               | 기대 결과                                           | 상태                          |
| --- | -------------------------------------------------- | --------------------------------------------------- | ----------------------------- |
| R01 | button role radio, aria-checked=false, tabindex=-1 | 승인 후 한 번 클릭해 aria-checked=true 확인         | 통제 PASS / live 대기         |
| R02 | native radio/checkbox, 이미 선택됨                 | 기존 동작 보존; 상태 일치 시 불필요한 클릭 없음     | PASS                          |
| R03 | 지원된 ARIA checkbox, disabled/aria-disabled/숨김  | 지원 범위만 제공; 차단 대상은 실행 없음             | PASS                          |
| R04 | 역할만 radio이고 checked 상태·실행 방식 불명       | 실행 가능한 대상으로 제공하거나 성공 처리하지 않음  | PASS                          |
| R05 | React의 지연 반영·대상 replacement                 | 유일한 읽기 재식별·bounded 검증, mutation 반복 없음 | 지연 PASS / 재식별 대기       |
| R06 | 클릭 후 상태 불변·혼합 상태·radio false 요청       | 실제 실패·미확인 사유 보존, 거짓 성공 없음          | PASS                          |
| R07 | Stop·scope 변경·승인 만료                          | 늦은 결과로 목표 완료 또는 추가 클릭 없음           | unit PASS / runtime 일부 대기 |
| R08 | native 선택·navigation completion·request 복구     | ISS-20261011-001 및 기존 회귀 유지                  | unit·Chrome PASS              |

## 수행한 분석 검사와 한계

2026-10-11, 현재 작업 트리에서 다음 두 기존 suite를 실행했다.

```bash
pnpm exec vitest run \
  extension/tests/unit/service-worker/page-derived-actions.test.ts \
  extension/tests/unit/content/semantic-snapshot.test.ts
```

2 files / 18 tests PASS. 기존 radio 도구 제공과 snapshot 계약의 검사이며,
button 기반 ARIA radio의 실제 클릭을 검증한 결과는 아니다.

후속 [웹 요소 호환성 audit](../../evidence/web-element-compatibility-audit-2026-10-11.md)에서
통제 Chrome `147.0.7727.15` / 번들 `0.1.100`의 Worker → Content 내부 경로를 실행했다.
`button[role=radio][aria-checked=false][tabindex=-1]`와 ARIA checkbox 모두 checked 도구에
제공되지만 `TARGET_NOT_ACTIONABLE`로 거절되고 click counter는 각각 0이었다. snapshot에도
checked 상태가 없었다. [JSON 관찰 증거](../../evidence/web-element-compatibility-audit-2026-10-11.json)를
보존한다. 전체 승인/Provider 경로와 원래 사이트의 재현은 아니며 코드 수정·수정 build·배포는
아직 수행하지 않았다. 다른 컨트롤의 공통 판별 문제는
[ISS-20261011-003](2026-10-11-web-control-capability-parity.md)에 연결했다.

## 이력

| 날짜       | 상태        | 내용                                                                                                 |
| ---------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| 2026-10-11 | 해결안 정리 | ZIP 무결성·typed 실행 거절 확인; native-only 실행과 역할 기반 도구 제공의 불일치 분석                |
| 2026-10-11 | 해결안 정리 | 통제 Chrome에서 ARIA radio/checkbox의 도구 제공·상태 누락·클릭 전 거절을 재현; ISS-20261011-003 연결 |
| 2026-10-11 | 해결안 정리 | S21-C2~C4/R2의 요소·action 완료 추가 판단 계획에 연결. 구현·검증 상태는 유지                         |

## 2026-10-11 수정 및 검증 갱신

[수정 증거](../../evidence/aria-checked-control-fix-2026-10-11.md)에 코드와 실행 범위를 기록했다.
R01은 통제 Worker/Content 및 schema에서 PASS(전체 승인·live Provider 미검증),
R02/R03/R04/R06은 단위·통제 Chrome에서 PASS다. R05의 지연 반영은 PASS이고
replacement는 TARGET_STALE로 중단하며 재클릭하지 않는다. 유일한 읽기 재식별은 남은 작업이다.
R07의 document/scope/ref 변경 차단과 기존 lifecycle unit 회귀는 통과했으나 원래 사이트의
Stop·승인 만료 전체 흐름은 미검증이다. R08은 전체 unit 741개 및 fixture/e2e에서 통과했다. 기존 anchor menuitem·delayed cost screen도 실제 Side Panel 승인 + 통제 Provider Chrome 2 cases PASS다.

상태는 **검증 중**이다. native input/ARIA button 범위의 `$500` 실행 거절은 수정했고,
원래 사이트·실제 Provider·replacement 읽기 재식별·배포 검증이 남아 있어 해결로 종결하지 않는다.

| 날짜       | 상태    | 내용                                                                                                               |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| 2026-10-11 | 검증 중 | shared checked reader, ARIA button 실행, 지연 상태 관찰, no-op, disabled/mixed 후보 정정; Chrome 및 회귀 증거 연결 |

## 2026-10-11 S21 구현·검증 후속

actual dispatch receipt·이미 선택된 no-op·지연/교체 DOM의 읽기 전용 상태 판단·중복 클릭 차단를 구현했다.
[소스·회귀·통제/live 증거](../../evidence/s21-assessment-2026-10-11.md)를 연결한다.
기존 이력과 당시 실패 관찰은 보존한다. 현재 상태는 **검증 중**이다.
원래 운영 사이트·배포는 미검증이며, controlled HTTPS와 실제 모델이 연결된 fixture
표본을 실제 사이트 수락 조건 충족으로 대체하지 않는다.
