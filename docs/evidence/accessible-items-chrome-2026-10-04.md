# Accessible items 실제 Chrome 검증 — 2026-10-04

수정 후 결과는 [0.1.89 검증 기록](accessible-items-fix-2026-10-04.md)을 참조한다.
이 문서는 수정 전 0.1.88의 관측 기록이다.

## 결과

`http://127.0.0.1:3002/#controls`의 앞서 안내한 케이스를 17개로 나누어
실제 Chrome과 실제 ContextPilot Side Panel에서 모두 시도했다.
**전체 통과가 아니다.** Workflow 오류와 일반 페이지 Act 제한/오류가 재현됐다.
기존 Community 통제 fixture 통과를 이 페이지의 전체 테스트 성공으로 확대하지 않는다.

기준 Browser commit: `f4406b2109690e114079cf2691eb08edf474fbad`, extension 0.1.88.
Chrome for Testing 147.0.7727.15, Linux x86_64, Node 20.19.6.
별도 임시 profile을 사용하고 기존 사용자 profile/Provider 설정은 변경하지 않았다.
실제 Side Panel의 요청 입력, Workflow 선택/일반 한 단계 실행, 작업 승인,
permission once/deny와 값 입력을 조작하고 실제 페이지 DOM 상태를 확인했다.
X11/Xvfb에서도 입력·메뉴·Workflow 실패를 재현했다.

Provider는 별도 local HTTPS OpenAI-compatible chat_completions fixture다.
projection의 opaque model ref와 제공 tool schema로 응답한다. 사용자 ZIP의
외부 Responses 모델은 호출하지 않았으며 live 모델 응답 품질은 검증하지 않았다.
각 케이스 사이 CANCEL/권한 철회/페이지 reload를 수행했다.
Preview/menu/dialog의 선행 조건 준비는 직접 페이지 조작이며 해당 준비를
확장 기능 성공으로 계산하지 않았다.

## Side Panel 케이스 결과

| ID | 테스트 | 결과 | 실제 관측 |
| --- | --- | --- | --- |
| read | Ask 컨트롤 읽기 | PASS (projection 전달) | 입력/checkbox/radio/비활성 버튼·옵션이 Provider projection에 전달됨; live 답변 정확도는 제외 |
| search | Search query 입력 | FAIL | 승인·권한·값 입력 후 대상 실행 불가; 입력값은 그대로 빈 값 |
| notes | Notes 입력 | FAIL | 승인·권한·값 입력 후 대상 실행 불가; 입력값은 그대로 빈 값 |
| scope | Detailed 선택 | PASS (재실행) | 선택값 `detailed`, checkbox는 false, preview는 disabled |
| checkbox | Include detailed results 체크 | PASS | checked=true, scope 미선택이면 preview는 계속 disabled |
| disabled-preview | 초기 Generate preview 실행 | PASS (차단) | 대상 실행 불가; disabled=true, 결과 변화 없음 |
| preview | 준비 후 Generate preview 실행 | BLOCKED | 버튼은 enabled지만 완료 조건을 확인할 수 없어 dispatch 차단; 결과 문구 변화 없음 |
| workflow | Generate local preview 선택·시작 | FAIL | WORKFLOW_STATE_MISMATCH; Provider action proposal 요청 전에 실패 |
| deny | 입력 권한 거부 | PARTIAL | 입력값은 변경되지 않음; 거부 후에도 27초 관측 동안 Panel send 상태가 stop으로 남아 수동 Cancel 필요 |
| tab | Activity 선택 | BLOCKED | 완료 조건 확인 불가; aria-selected=false 유지 |
| menu | Open local menu | FAIL | 대상 실행 불가; aria-expanded=false 유지 |
| reviewed | 열린 메뉴의 Mark reviewed | BLOCKED | 완료 조건 확인 불가; result 변화 없음 |
| dialog-open | 열린 메뉴에서 dialog 열기 | BLOCKED | 완료 조건 확인 불가; dialog.open=false 유지 |
| dialog-close | 열린 dialog 닫기 | BLOCKED | 완료 조건 확인 불가; dialog.open=true 유지 |
| disclosure | details 펼치기 | UNAVAILABLE | summary가 현재 semantic projection/action target에 없어 proposal 불가; details.open=false |
| disabled-action | Disabled action 실행 | PASS (차단) | disabled node는 읽히지만 실행되지 않음 |
| password | Account password 값 질문 | PASS (비노출 경계) | password/OTP input와 fixture 값 `not-projected`가 Provider projection/request에 없음 |

scope 첫 테스트는 harness의 exact-name 매칭 때문에 proposal이 생성되지 않았다.
실제 projection 이름에 맞춰 다시 요청했고, fixture가 HTML value `detailed`를
잘못 전달한 실행은 INVALID_ARGUMENT이었다. 제공 tool enum의 표시값 `Detailed`로
수정한 **최종 실행이 PASS**다. 이 두 harness 오류는 제품 실패로 계산하지 않는다.

password 결과는 민감값이 모델 입력으로 전달되지 않는 경계 증거다.
통제 Provider가 반환한 문구로 live 모델의 secret 질문 응답 품질을 판정하지 않는다.

## Workflow 원인

페이지의 선언 target은 `{role:"combobox",name:"Report scope"}`다.
실제 semantic projection name은 `Report scope Choose a scope Summary Detailed`다.
`workflowTarget`의 이름 일치 조건에서 target을 찾지 못한다.
사용자 제공 ZIP도 동일 WORKFLOW_STATE_MISMATCH로 끝났고, 이번 실제 페이지
실행에서도 같은 오류를 재현했다. 사용자 ZIP 원문 prompt가 redacted되어 있으므로
당시 요청의 정확한 문구나 모든 상태가 동일했다고 주장하지 않는다.

## 직접 페이지 조작 대조

확장 실행 이후 별도로 Chrome CDP의 마우스·키보드 입력을 사용했다.
Search query/Notes 입력, Detailed 선택, checkbox 체크, Preview 클릭,
Activity tab, 메뉴 열기, Mark reviewed, dialog 열기·닫기, details 펼치기의
11개 직접 조작이 모두 정상 동작했다. Preview는 `Preview generated for Detailed.`,
Mark reviewed는 `Local item marked reviewed.`를 표시했다.
이 결과는 fixture 자체의 동작 확인이며 Side Panel Act 성공으로 계산하지 않는다.

## 증거와 변경 경계

- `/tmp/accessible-chrome-results.json`: 17개 Side Panel 시도, 전후 DOM 상태·tool 이름·projection metadata.
- `/tmp/accessible-chrome-retry-results.json`: X11에서 입력/메뉴/Workflow 재현.
- `/tmp/accessible-chrome-scope-results.json`: 올바른 tool enum으로 Detailed 선택 최종 PASS.
- `/tmp/accessible-chrome-native-results.json`: 직접 Chrome 마우스·키보드 11개 정상 동작.
- `/tmp/accessible-chrome-tests.mjs`, `/tmp/accessible-chrome-retry.mjs`, `/tmp/accessible-chrome-scope.mjs`: 임시 실행 harness.

모든 임시 Chrome과 Provider fixture는 종료했다. 제품 코드는 수정하지 않았다.
이 문서만 추가했으며 commit/push는 수행하지 않았다.
앞선 테스트 안내에 정상 실행 예로 제시했던 항목 일부는 현재 구현에서
실제로 실패/차단됨이 확인됐다. Community 출시 판단 시 이 결과를 함께 고려해야 한다.

실제 응답 HTML SHA-256: `3071f9c1b4825d42f4400237504f20f3ed16cfd24d38db81607977e474032ca9`.
