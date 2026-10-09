# Page Act Harness 리뷰 수정 재검증 결과

- 검증일: 2026-10-05
- 대상 저장소: `ewap-browser`
- 대상 revision: `a1fd57d6e227eda032981b4481104729708fa8b2`
- 수정 비교 기준: `c2a9857d5..a1fd57d6e`
- 판정: **기존 7건 중 4건의 조치를 확인했고, 3건은 부분 수정 상태다. 개발 완료 판정은 보류한다.**
- 기준 문서: [상세 설계](../34-page-act-context-harness-design.md), [Sprint 계획](../sprint-page-act-context-harness-plan.md)
- 개발자 기록: [PAH 구현 기록](pah-implementation-record.md). 이 보고서는 개발자 기록과 별도로 직접 실행한 재검증 결과다.

## 1. 검증 범위와 제한

리뷰 이후 추가된 코드와 테스트를 확인하고, 기존 지적의 재현 입력을 신규 revision에서
다시 실행했다. 마스킹·pagination·승인·tool-call 결속·추가 정보 판단은 합성 자료를
사용한 내부 함수 검증이다. 실제 고객 페이지·credential을 사용하지 않았다.

실제 Chrome에서는 문서의 Search 입력 요청을 두 경로로 실행했다. 일반 한 단계 실행과
동일 요청에서 Preview 워크플로우를 선택하는 경로를 비교했다. 현재 소스를 임시 경로에
빌드하고 격리된 Chrome 프로필·로컬 HTTPS fixture·통제 Provider를 사용했다.

Chrome 결과는 UI·도구 전달·실제 실행 상태의 검증이며 실제 LLM의 자연어 판단 성능
검증은 아니다. live Provider, Platform, workspace 통합 테스트는 실행하지 않았다.
Browser 내부 ErrorCode 추가는 확인했으며 이번 변경에서 workspace spec 수정은 없었다.

재검증 중 제품 코드와 기존 설계·Sprint·예제·테스트 파일은 수정하지 않았다.
Chrome의 무관 후보 선택 재현을 위한 테스트 변형은 `/tmp` 복사본에만 적용했다.
이 문서 저장도 기존 문서의 동기화 또는 Sprint 완료 처리에 해당하지 않는다.

## 2. 기존 7건의 판정

| 번호 | 기존 지적 | 재검증 결과 | 실제 확인 범위 |
| --- | --- | --- | --- |
| 1 | Harness가 실제 실행 경로에 미연결 | **부분 수정** | bootstrap/bridge는 번들에 포함되고 Act 시작에서 호출된다. 하지만 envelope·읽기 도구·provider continuation·워크플로우 LLM 재검토는 실제 실행에 연결되지 않았다. Chrome에서 원래 실패 경로가 재현됐다. |
| 2 | 소스 분할·검색 마스킹 우회 | **기존 재현 케이스 통과** | 전체 source의 민감 줄을 판정한 뒤 chunk/search 발췌를 처리한다. `api_key`와 값이 분리된 기존 입력에서 부분 읽기와 검색 결과에 합성 값이 남지 않았다. 모든 source의 민감값 탐지 완전성을 보증하는 결과는 아니다. |
| 3 | 컴포넌트 데이터 무마스킹 | **부분 수정** | 단순 `password` 문자열은 마스킹된다. 민감 키 아래 배열·객체, URL fragment, 같은 문자열의 두 번째 Bearer 값은 누출된다. |
| 4 | 추가 읽기에서 첫 페이지 반복 | **부분 수정** | 명시적 `max_items:200`에서 첫 행이 0→200→400으로 진행된다. 기본 옵션에서는 마지막 페이지·빈 페이지가 계속 incomplete로 반환된다. |
| 5 | 승인 소비를 원자적으로 기록하지 않음 | **신규 저장소 단독 검증 통과** | `consumeStoredApproval`의 동일 approval ID 두 번째 소비가 `APPROVAL_REUSED`로 거부된다. 기존 pure helper는 남아 있고 신규 저장소의 실제 제품 실행 연결은 미완료다. |
| 6 | 코드가 LLM의 `needs_context`를 거부 | **수정 확인** | 자료 종류 목록이 모두 존재해도 모델의 `needs_context`를 오류 없이 유지한다. |
| 7 | 같은 turn의 중복 tool-call ID 허용 | **수정 확인** | 동일 응답 내부의 중복 ID를 거부하고 실패 시 기존 seen 집합에 일부 ID를 추가하지 않는다. |

## 3. 남은 문제 R1 — 실제 읽기·검토 루프와 workflow 경로

우선순위: **P1**. 기존 지적 1의 미완료 부분이다.

[Act 시작](../../extension/src/service-worker/act-chat-start.ts)은
`composeActEntryEnvelope`를 호출하지만 session에는 `read_tools`, `propose_tools`,
`entry_roles`만 보관한다. 구성한 envelope를 최초 provider 문맥으로 전달하지 않는다.
읽기 도구의 실제 function schema·executor·tool result continuation도 추가되지 않았다.

[step runner](../../extension/src/service-worker/act-step-runner.ts)의 제공 도구는 여전히
기존 `genericActTools`다. 신규 검사는 `!session.workflow`일 때만 도구 축소 오류로
종료하며, workflow 경로에서는 trace만 남긴다. 별도의 LLM 적합성 재검토 호출은 없다.

후보 선택 화면에서 [workflow session 구성](../../extension/src/service-worker/workflow-session-actions.ts)을
거치는 경우에는 시작 시 생성한 Harness 정보를 새 session으로 전달하지도 않는다.
따라서 단순히 bridge가 번들에 포함됐다는 사실로 실행 harness 전체가 연결됐다고 볼 수 없다.

### 3.1 번들 의존성 확인

5개 확장 진입점을 현재 source로 메모리 번들링했다. 전체 입력 221개 중 다음 4개만
`page-act-harness` 모듈이다.

- `contracts.ts`
- `bootstrap-composer.ts`
- `capability-check.ts`
- `act-entry-bridge.ts`

`read-loop.ts`, `resource-reader.ts`, `workflow-review.ts`, `approval-store.ts` 등은
이 실행 번들 의존성에 없다. 초기 리뷰의 포함 파일 0개에서 일부 연결은 진행됐지만,
사용자에게 필요한 읽기·계획·검토·실행 흐름은 아직 연결되지 않았다.

### 3.2 실제 Chrome 결과

두 경로 모두 요청 원문은 `Search query에 browser test를 입력해줘.`다.

| 항목 | 일반 한 단계 실행 | Preview 워크플로우 선택 |
| --- | --- | --- |
| 입력 요청 검증 | **PASS** | **FAIL** |
| workflowSelected | false | true |
| Search 최종 값 | `browser test` | 빈 문자열 |
| Report scope 최종 값 | 빈 문자열 | `detailed` |
| Include detailed results | false | true |
| 최종 Preview 상태 | 생성하지 않음 | `Preview generated for Detailed.` |
| 실제 실행 도구 | 일반 도구 집합에서 `propose_set_text` 사용 | `propose_select_option` → `propose_set_checked` → `propose_click` |

무관 후보 선택 케이스에서 scope 단계에는 선택 도구만, checkbox 단계에는 체크 도구만,
Preview 단계에는 click 도구만 제공됐다. 입력 목표를 재검토하는 경로 없이 다른
페이지 변경이 진행됐으며, Search 입력 상태 assertion이 실패했다.

통제 Provider는 선택된 경로에서 고정된 제안을 반환한다. 이 실패는 실제 모델이 잘못
추론했다는 증거가 아니라, 사용자 선택 이후 요청 적합성을 검토·조정하는 제품 경로가
없다는 실행 증거다. 일반 경로만 PASS인 기존 테스트로 이 문제의 해결을 주장할 수 없다.

### 3.3 필요한 조치

최초 envelope·실제 읽기 도구 schema를 provider에 전달하고, 발견→읽기→결과 반환→
추가 판단 루프를 연결해야 한다. 후보 발견·선택 후에는 현재 페이지·필요한 코드·원래
요청으로 LLM 적합성 검토를 수행해야 한다. workflow가 있다는 이유로 미리 고정 step을
제공하거나 원래 입력 목표를 Preview 생성으로 바꾸지 않는다.

## 4. 남은 문제 R2 — 컴포넌트 마스킹 누락

우선순위: **P1**. 기존 지적 3의 미완료 부분이다.

[maskComponentRows](../../extension/src/page-act-harness/component-facade.ts)의 민감 키
처리가 타입별 분기와 재귀 과정에서 보존되지 않는다. 배열은 key 없이 자식을 처리하고,
객체는 자식의 key로 교체한다. URL query를 마스킹한 뒤 fragment를 그대로 붙이고,
Bearer 정규식은 첫 번째 일치만 치환한다.

합성 marker `ReviewCanaryABC`를 사용한 결과는 다음과 같다.

| 입력 모양 | 결과 | redacted_count |
| --- | --- | --- |
| `{password: marker}` | marker 제거 | 1 |
| `{password: [marker]}` | **marker 잔존** | 0 |
| `{password: {value: marker}}` | **marker 잔존** | 0 |
| `{label: "https://app.test/path?token=dummy#access_token=marker"}` | **fragment marker 잔존** | 1 |
| `{label: "Bearer marker and Bearer marker"}` | **두 번째 marker 잔존** | 1 |

이 결과는 내부 함수가 provider에 전달할 수 있는 content를 만드는 경계의 검증이다.
해당 component 모듈은 아직 제품 실행에 연결되지 않아 실제 고객 정보가 유출됐다는
주장은 하지 않는다. 연결 전에 이 경계를 보완해야 한다.

필요한 조치는 민감 키를 값 타입과 무관하게 처리하거나 하위 전체에 민감 상태를
전파하는 것, URL fragment의 민감값 처리, 동일 문자열의 모든 Bearer 값 처리다.
부분 마스킹 뒤 남은 값이 있는데도 안전하게 처리됐다고 해석하지 않도록 검증한다.

## 5. 남은 문제 R3 — 기본 옵션의 pagination 종료 실패

우선순위: **P2**. 기존 지적 4의 미완료 부분이다.

[readChannel](../../extension/src/page-act-harness/component-facade.ts)은 offset을 반영하지만
`hitCap = (input.max_items ?? rows.length) > 200`으로 전체 입력 행 수를 검사한다.
`max_items`를 생략하면 이미 끝에 도달했어도 `hitCap`이 계속 true다.

EOF가 확인된 전체 550행의 합성 grid로 재현했다.

| 호출 | 반환 행 수 | complete | next cursor |
| --- | --- | --- | --- |
| offset 0, max_items 200 | 200 | false | `offset:200` |
| offset 200, max_items 200 | 200 | false | `offset:400` |
| offset 400, max_items 200 | 150 | true | 없음 |
| offset 400, max_items 생략 | 150 | **false** | `offset:550` |
| offset 550, max_items 생략 | 0 | **false** | `offset:550` |

기본 옵션으로 cursor를 따라가면 빈 페이지가 같은 cursor를 반복한다. 명시적으로
`max_items:200`을 주는 테스트만으로 기본 동작의 종료까지 검증할 수 없다.

실제 남은 자료·반환 범위·EOF로 종료를 판정하고, 기본 옵션과 명시적 옵션의 마지막
페이지 검증을 함께 수행해야 한다. EOF가 없는 자료를 강제로 complete로 바꾸는 조치는 하지 않는다.

## 6. 직접 실행한 검증

| 검증 | 결과 | 범위 |
| --- | --- | --- |
| `npm run typecheck` | PASS | 현재 source의 TypeScript 검사 |
| `npm run lint` | PASS | ESLint·Prettier |
| `npm run test:unit -- --reporter=dot` | **123 files / 549 tests PASS** | 기존 및 신규 unit. 실제 LLM 추론 증거는 아님 |
| `git diff --check c2a9857d5..HEAD` | PASS | 수정 commit의 공백 검사 |
| 메모리 번들 의존성 검사 | PASS, Harness 4개 포함 | 5개 실제 확장 진입점의 연결 확인 |
| 임시 확장 artifact 빌드 | PASS, 버전 0.1.90 | esbuild + 실제 method trace plugin, 1,462개 계측 method/callback. 원본 artifact·버전 파일은 변경하지 않음 |
| 내부 함수 합성 자료 재현 | 수정 확인 4건, 잔여 문제 3건 | 각 항목의 표에 명시한 입력·출력 |
| Chrome 일반 Search 입력 | PASS | 격리 Chrome·통제 Provider·실제 Side Panel/DOM |
| Chrome Search 요청 + Preview 선택 | **FAIL** | 요청한 Search 입력 없이 다른 Preview 단계 실행 |
| live Provider·실제 모델 추론 | 미실행 | 통제 Provider 결과로 대체하지 않음 |
| Platform·workspace 통합 | 미실행 | Browser-local 재검증 |
| 기존 전체 fixture/e2e 명령 | 이번 재검증에서 미실행 | 개발자 기록의 PASS와 직접 실행 결과를 구분 |

## 7. 실행 환경과 증거 위치

임시 빌드·Chrome 테스트 root는 `/tmp/pah-reverify-AlegJN`이다.
소스는 대상 revision에서 읽었으며 버전 증가 스크립트를 실행하지 않았다.

Chrome executable은 `/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome`이며
`xvfb-run`으로 headed mode를 실행했다. 기존 사용자의 Chrome 프로필은 사용하지 않았다.

일반 입력 경로는 임시 복사한 `scripts/chrome-accessible-items-smoke.mjs`에
`ACCESSIBLE_ITEMS_CASES=search`를 설정해 실행했다. 무관 후보 선택 경로는 임시 복사본에서
search case의 `current.workflow=true`를 설정한 별도 스크립트로 실행했다.
이 설정은 Preview를 선택한 사용자 경로를 재현하기 위한 것으로 제품 코드 수정은 아니다.

| 파일 | 내용 |
| --- | --- |
| `/tmp/pah-reverify-AlegJN/search-normal.json` | 일반 입력 PASS, 실제 전후 상태·제공 도구·UI 결과 |
| `/tmp/pah-reverify-AlegJN/search-forced-workflow.json` | 무관 후보 선택 FAIL, 실제 전후 상태·각 단계 도구 |
| `/tmp/pah-reverify-AlegJN/search-normal.log` | 일반 입력 Chrome 종료 코드 0 |
| `/tmp/pah-reverify-AlegJN/search-forced-workflow.log` | 입력 상태 assertion 실패, Chrome 테스트 종료 코드 1 |
| `/tmp/pah-reverify-AlegJN/scripts/chrome-pah-forced-workflow-review.mjs` | 임시 테스트 변형 원문 |
| `/tmp/pah-reverify-typecheck.log` | 직접 실행한 typecheck 로그 |
| `/tmp/pah-reverify-unit.log` | 직접 실행한 549개 unit 결과 |
| `/tmp/pah-reverify-lint.log` | 직접 실행한 lint 로그 |

`/tmp` 자료는 저장소에 포함하지 않은 임시 증거이며 정리·재부팅 등으로 없어질 수 있다.
이 문서에는 핵심 입력·판정·실제 페이지 상태를 함께 기록해 임시 파일 없이도 결과를
이해할 수 있게 했다. 이후 revision의 성공 증거로 이 결과를 재사용하지 않는다.

## 8. 후속 재검증 기준

1. 최초 provider payload에 Harness 문맥과 실제 호출 가능한 읽기 도구가 포함돼야 한다.
2. 실제 tool-call→read result→추가 판단 루프가 동일 request/binding에 연결돼야 한다.
3. Search 요청에서 Preview를 선택해도 바로 scope/checkbox/Preview mutation을 진행하지 않고,
   요청 적합성 검토·새 계획 또는 사용자 clarification을 거쳐야 한다.
4. 중첩 민감 필드·fragment·반복 Bearer 값이 content/egress/로그에 남지 않아야 한다.
5. 기본 pagination이 550행에서 종료되고 빈 페이지·동일 cursor 반복이 없어야 한다.
6. 신규 승인 저장소·검토·결과 분리가 실제 실행에 연결됐는지 Chrome 증거로 확인해야 한다.
7. 통제 Provider·실제 LLM·Browser-local·Platform 통합의 검증 범위를 계속 분리한다.

본 재검증에서는 기존 작업 트리의 미추적 `examples/workflow-review-direction.md`,
`opencode.json`을 변경하지 않았고 commit/push도 수행하지 않았다.
