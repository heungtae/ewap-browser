# ISS-20261014-001 — 프로파일 관리 창과 대화 복구의 창 바인딩

- 발생·최근 갱신: 2026-10-14
- 상태: 해결 — 아래 Browser-local 완료 조건의 검증 범위
- 범위: Browser-local, 별도 프로파일 관리 창을 여는 통제 Chrome
- 환경: Linux, Chrome for Testing 147.0.7727.15, extension 0.1.109
- source: `a1f111fcb9b2f402e9ef6790728225120270ae3c` + 기존 변경 및 이번 미커밋 변경

## 증상과 원인

별도 관리 창을 연 후 원래 페이지에 Ask 요청을 보내면 Provider 응답과
`assistant_delta`·`run_terminal` 이벤트는 생성되지만 Panel에는 사용자 요청만
남았다. 최초 통제 Chrome 실행은 `ASK_COMPLETION`으로 실패했다.

Panel의 요청은 `PANEL_REQUEST`의 인증된 `window_id`를 사용했지만,
`recoverChatEvents`의 `CHAT_RECOVER`는 envelope 없이 전송됐다.
Chrome의 SIDE_PANEL context가 `windowId: -1`을 보고하는 환경에서 직접 복구는
마지막으로 포커스된 관리 창의 탭을 선택했다. 같은 Panel에서 대조한 결과,
직접 복구의 이벤트 목록은 비었고, 원래 창 ID로 바인딩한 복구에는
해당 요청의 assistant·완료 이벤트가 있었다.

## 수정과 보존 경계

대화 복구에도 기존 `sendRuntime`의 `PANEL_REQUEST` envelope를 사용한다.
창 ID는 Panel의 `chrome.windows.getCurrent()`에서 받고 기존 Worker 검증을
유지한다. 프로파일 관리 창은 전용 관리 메시지에만 허용되며, 일반 Settings·Panel
권한으로 취급하지 않는다. 기존 sender/document/window 검증을 완화하지 않는다.

## 완료 조건과 회귀 검증

- 다른 창이 포커스돼도 Panel의 바인딩된 창에서 탭을 조회한다.
- 별도 프로파일 관리 창을 열고 재사용한 뒤에도 원래 페이지 Ask 응답이 표시된다.
- 관리 창의 검색·편집·삭제와 기존 S24 save/reuse/off 검증이 통과한다.
- 기존 외부 sender, 중복 context, 창 ID 불일치 회귀 검증을 통과한다.

검증: [sender context unit](../../../extension/tests/unit/service-worker/page-sender-context.test.ts),
[S24 Chrome](../../../scripts/chrome-s24-smoke.mjs),
[관리 창 검증](../../../scripts/chrome-learned-profile-manager.mjs).
실행 결과와 미검증 범위는 [2026-10-14 증거](../../evidence/s24-profile-manager-2026-10-14.md)에 기록한다. 실제 사이트·Provider,
Windows, 사용자 설치·배포는 이 이슈의 통제 Chrome 완료 조건에 포함하지 않는다.

## 실행 결과와 이력

2026-10-14: 관리 창을 열고 기존 창에 Ask 요청하는 통제 Chrome에서 최초 실패를
확인했다. 창 focus 조정만으로 해결되지 않았으며, 직접 복구와 인증된 창 복구의
탭·이벤트 대조로 원인을 확인했다. 위 복구 envelope 수정 후 동일 Ask/관리 창
검증과 기존 S24 Act 검증이 모두 PASS했다. sender 검증, Settings/Panel와 학습
프로필 관련 27개 파일·98개 단위 테스트, typecheck·lint·패키지 검증도 PASS했다.
완료 조건을 충족해 `해결`로 변경했다. 수정은 미커밋 상태이며 배포하지 않았다.
저장소 전체 source-size 검사는 기존 초과 파일들로 FAIL하며 이번 신규 모듈은
199줄 이하다.
