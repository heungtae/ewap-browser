# S8 — Permission Mode와 Permission-less Hardening

상태: **Completed** (2026-09-26, Linux Browser 로컬 범위).
[종료 증거](../evidence/s8-closure-2026-09-26.md).

## 목표

`standard`, `follow_a_plan`, `skip_all_permission_checks`를 제품 설정과 runtime에 도입한다. permission 생략 모드에서도 restricted origin, denylist/category, credential, R2/R3, target binding, CDP와 verifier hard policy가 유지됨을 증명한다.

로컬 종료 판정은 설정 UI와 현재 Browser Act 경로에 적용한다. managed
permission mode override와 enterprise category/PDP 연동은 S12,
durable audit/export 계약은 S13의 범위다. generic Act의 navigation은
검증된 이동 후 현재 session을 종료하므로 redirect 뒤 작업은 새 요청의
새 origin 검사로 다룬다. Linux Chrome for Testing의 통제 HTTPS
fixture와 unit에서 가능한 경계를 판정한다.

## 선행 조건

- S7 generic Act의 permission/confirmation/execution stage가 분리돼 있다.
- S5 UI가 run-level mode badge와 danger Settings flow를 지원한다.

## 구현 범위

1. closed `PermissionMode` schema와 저장값 검증
2. standard once/always/deny regression
3. plan proposal/review, exact domain scope와 scope violation
4. permission-less typed warning/activation/deactivation
5. mode 변경 시 모든 활성 tab run과 request 취소 후 새 mode 적용
6. permission-prompt bypass와 hard-policy pipeline 분리
7. navigation/redirect 후 hard policy 재검사
8. permission-less badge, run banner와 action-card 표시
9. mode 이름의 UI 표시와 기존 secret-free diagnostics 경계
10. 세 mode의 현재 Browser tool/host/risk security matrix

## 핵심 구현 제약

`skip_all_permission_checks`가 반환하는 것은 capability permission stage의 `ALLOW_WITHOUT_PROMPT`뿐이다. resolver, hard deny, credential classifier, risk classifier, confirmation, preflight, executor allowlist와 verifier 함수는 호출 순서와 결과가 standard mode와 동일해야 한다. 하나의 `if (skip) execute()` shortcut을 만들지 않는다.

## 구현 카드

| 카드   | 산출물                    | 종료 조건                                  |
| ------ | ------------------------- | ------------------------------------------ |
| S8-C1  | settings/schema migration | unknown mode와 Chat-origin change 거부     |
| S8-C2  | mode activation UX        | typed phrase와 해제 후 standard 복귀       |
| S8-C3  | mode 전환 경계            | 모든 tab의 기존 run/request 취소           |
| S8-C4  | standard regression       | once/always/deny/withdraw/navigation       |
| S8-C5  | follow-plan policy        | exact domains, renewal, no wildcard bypass |
| S8-C6  | permission-less branch    | permission request count 0                 |
| S8-C7  | shared hard-policy chain  | R2/R3/credential/restricted/category 유지  |
| S8-C8  | UI/diagnostics            | visible mode badge와 민감값 비노출         |
| S8-C9  | origin/IDN/port tests     | exact-origin scope 우회 0                   |
| S8-C10 | Chrome adversarial matrix | 현재 Browser에 적용 가능한 행 판정         |

## 완료 조건

- [검증 matrix](../18-claude-browser-capability-verification-plan.md#8-permission-mode-검증)의 현재 Browser에 적용 가능한 mode/negative 행을 unit과 Chrome로 판정하고 제외 범위를 증거에 명시
- skip mode에서 permission card 0과 normal action 성공을 함께 증명
- skip mode에서 R2 pre-confirmation dispatch와 저장된 deny에 따른 dispatch 0을 Chrome에서 확인. R3, credential, restricted origin은 기존 S2 Chrome/단위 hard guard와 현재 unit에서 재검증
- page/model/runtime message로 mode 변경 불가
- mode 변경 시 기존 활성 run/request와 pending permission/plan scope 폐기
- Provider 요청에 credential 원문이 없고 진단 경계는 기존 S2/S5 unit과 회귀 증거를 따른다
- 실제 Chrome evidence가 상태 원장에 연결
