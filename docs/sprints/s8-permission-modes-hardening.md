# S8 — Permission Mode와 Permission-less Hardening

## 목표

`standard`, `follow_a_plan`, `skip_all_permission_checks`를 제품 설정과 runtime에 도입한다. permission 생략 모드에서도 restricted origin, denylist/category, credential, R2/R3, target binding, CDP와 verifier hard policy가 유지됨을 증명한다.

## 선행 조건

- S7 generic Act의 permission/confirmation/execution stage가 분리돼 있다.
- S5 UI가 run-level mode badge와 danger Settings flow를 지원한다.

## 구현 범위

1. closed `PermissionMode` schema, migration과 managed override
2. standard once/always/deny regression
3. plan proposal/review, exact domain scope와 scope violation
4. permission-less typed warning/activation/deactivation
5. run-start immutable mode snapshot
6. permission-prompt bypass와 hard-policy pipeline 분리
7. navigation/redirect 후 hard policy 재검사
8. permission-less badge, run banner와 action-card 표시
9. mode 변경 audit와 secret-free diagnostics
10. 세 mode의 전 tool/host/risk security matrix

## 핵심 구현 제약

`skip_all_permission_checks`가 반환하는 것은 capability permission stage의 `ALLOW_WITHOUT_PROMPT`뿐이다. resolver, hard deny, credential classifier, risk classifier, confirmation, preflight, executor allowlist와 verifier 함수는 호출 순서와 결과가 standard mode와 동일해야 한다. 하나의 `if (skip) execute()` shortcut을 만들지 않는다.

## 구현 카드

| 카드   | 산출물                    | 종료 조건                                  |
| ------ | ------------------------- | ------------------------------------------ |
| S8-C1  | settings/schema migration | unknown mode와 Chat-origin change 거부     |
| S8-C2  | mode activation UX        | typed phrase, cancel, managed policy       |
| S8-C3  | immutable run snapshot    | mid-run change cancels old run             |
| S8-C4  | standard regression       | once/always/deny/withdraw/navigation       |
| S8-C5  | follow-plan policy        | exact domains, renewal, no wildcard bypass |
| S8-C6  | permission-less branch    | permission request count 0                 |
| S8-C7  | shared hard-policy chain  | R2/R3/credential/restricted/category 유지  |
| S8-C8  | UI/audit/diagnostics      | visible warning과 content-free record      |
| S8-C9  | redirect/IDN/port tests   | origin normalization 우회 0                |
| S8-C10 | Chrome adversarial matrix | PERM-SKIP-001~013 전체                     |

## 완료 조건

- [검증 matrix](../18-claude-browser-capability-verification-plan.md#8-permission-mode-검증)의 모든 mode 통과
- skip mode에서 permission card 0과 normal action 성공을 함께 증명
- skip mode에서 R2 pre-confirmation dispatch, R3, credential, denylist와 restricted origin dispatch가 모두 0
- page/model/runtime message로 mode 변경 불가
- mode 변경 후 기존 pending permission/confirmation/action token 폐기
- audit/export/diagnostics에 mode 이름 외 page/action value 없음
- 실제 Chrome evidence와 reviewer가 상태 원장에 연결
