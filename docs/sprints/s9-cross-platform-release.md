# S9 — Linux 로컬 release candidate

## 목표

S0~S8의 package, Chat UI, hidden-DOM read, Vision, generic Act, permission modes와 provider/plugin 계약을 Linux clean Chrome profile에서 검증하고 upgrade/rollback 가능한 로컬 release candidate를 만든다. Windows 배포와 대외 출시 판정은 이 Sprint의 `Completed` 의미에 포함하지 않는다.

## 선행 조건

- S0~S8이 상태 원장에서 `Completed`이고 V3 evidence가 연결돼 있다.
- blocker와 known critical/high security issue가 0이다.

## 구현·검증 범위

1. extension package와 generated registry reproducibility
2. browser permission/host/CDP command snapshot
3. clean install, unpacked/package load와 onboarding
4. provider single/multi-model Settings와 local network smoke
5. standard/follow-plan/permission-less mode UX
6. hidden DOM/screenshot disclosure와 privacy control
7. Ask streaming, panel reopen과 worker recovery
8. generic Act trusted input, R2/R3, Stop과 detach leak
9. prior-version settings/transcript/permission migration
10. upgrade, rollback과 uninstall cleanup

## 완료 조건

- Linux V4 clean-profile evidence
- 별도 제품 로그인/SSO/Cloud Sync surface 부재
- actual package hash, manifest permission과 CDP allowlist snapshot
- permission-less warning과 hard-policy negative smoke
- provider secret, page content, screenshot, action value 없는 export/diagnostics
- attached product debugger session leak 0
- package에 Claude artifact/symlink/license 미확인 asset 없음
- update/rollback 뒤 settings와 permission mode schema 일관성
- 상태 원장의 `Completed`와 검증 증거 연결

로컬 unit/fixture test만 통과하면 S9 완료가 아니다. Linux V4가 없으면 `Blocked`로 기록한다. Windows 검증과 별도 release reviewer 승인 없이 대외 출시 가능 또는 Windows 지원 완료를 선언하지 않는다.
