# S2 — 실행 승인과 Bounded CDP Mutation

capability × host 권한 카드, once/always/deny 저장, 철회와 navigation 경계, R0-R3 위험 분류, preflight, text/select 값 입력, 결과적 행동 확인, DOM executor, Level 2 bounded CDP adapter, Stop과 verifier를 구현한다. 웹사이트가 현재 Chrome session으로 인증됐다는 사실은 agent 행동 인가가 아니며 모든 mutation은 별도 permission gate를 통과한다. R2 confirmation은 현재 intent·run·target·value digest·document에 결속하고 일반 편의 설정으로 우회할 수 없으며 R3는 기본 거부한다. provider와 plugin capability는 browser 권한을 추가하지 못한다.

bounded CDP는 `docs/15-bounded-cdp-adapter.md`의 `DOM.*`/`Input.*` allowlist만 사용하며 action-scoped attach/detach, current document/ref binding, token 유일성/hit test와 dispatch 후 no-fallback/no-retry를 지켜야 한다. raw command, JavaScript, screenshot, Network/Target domain과 model/page/site-adapter 지정 selector·좌표는 범위 밖이다.

S7는 이 executor를 generic browser Act tool에 연결하고 S8은 permission mode를 추가한다. 둘 다 S2의 credential/R2/R3/binding/preflight/no-retry/verifier 경계를 유지한다. S6 screenshot/zoom은 별도 read capability이며 이 mutation CDP allowlist를 확장하지 않는다.

완료 조건:

- click/type 권한 경계와 submit 재확인 Chrome E2E; 직접 `navigate`/`download`/`network_write` tool은 미선언 상태에서 거부하고 navigation은 기존 문서/ref 폐기로 검증
- 현재 Chrome session 존재만으로 mutation이 허용되지 않으며 once grant가 run 종료 때 폐기되고 always grant가 철회·navigation 경계를 지키는 인가 E2E
- password, OTP, recovery code, token과 계정·보안 credential target의 read/type 거부
- R2 confirmation 우회 불가와 R3 기본 거부, provider/plugin capability에 의한 browser grant 확대 거부
- synthetic input 거부 control의 trusted click/key/text와 semantic verifier
- R2 confirmation 전 attach/dispatch 0
- unknown command/parameter, stale/cross-tab target, duplicated token, sensitive/occluded target 거부
- 미승인/restricted origin의 debugger attach 호출 0
- competing debugger conflict와 dispatch 전/후 failure classification
- Stop, navigation, tab close, worker restart와 모든 terminal path 뒤 product-owned attached session 0
- detach failure tab 격리와 다른 debugger를 detach하지 않는 recovery
- external E2E CDP와 product CDP allowlist의 분리

## 종료 재검증 행렬 (2026-09-25)

S2 판정에는 현재 빌드의 실제 unpacked extension을 연 Chrome for Testing
증거와 adapter/policy 단위 검증을 함께 사용한다. Chrome harness의
`Runtime.evaluate`는 fixture 상태 관측에만 쓰고 제품 CDP 명령으로
보내지 않는다. S7 generic Act의 provider 제안은 판정 범위가 아니다.

1. 실제 Side Panel의 fixture mutation에서 permission 거부·once·always,
   취소·철회·문서 이동을 확인한다. R2 확인 전후와 nonce 재사용,
   credential target 및 R3 차단을 관측한다. R2 submit fixture는 CDP click
   전에 확인을 요구하며, 확인 전 attach와 dispatch는 0건이다.
2. trusted click/key/text가 synthetic input을 거부하는 fixture에서
   일어나고, dispatch 뒤 semantic verifier가 완료 또는 `UNKNOWN`으로
   끝나는지 확인한다. browser session/cookie 자체는 grant가 아니다.
3. adapter의 command/parameter, token 유일성, hit test, stale binding,
   sensitive target, debugger 충돌을 실패 단계별로 검증한다. input 이후
   failure는 자동 재시도 없이 `UNKNOWN`이다.
   기존 텍스트가 있는 입력은 고정 Ctrl+A 후 trusted `Input.insertText`로
   교체하고 새 값의 exact match를 확인한다.
4. action 종료·Stop·navigation·tab close·worker 재시작 뒤 product-owned
   attach가 남지 않음을 확인한다. 복구는 exact tab에 무입력 ownership
   probe가 성공할 때만 detach하고, 실패하면 tab을 격리한다.

근거 문서에는 실행 명령, Chrome/산출물 버전, 각 단계의 관측값,
미검증 범위를 분리해 기록한다. 위 항목을 실제로 통과하기 전에는
`Completed`로 변경하지 않는다.

현재 종료 판정과 제한은 [S2 증거](../evidence/s2-closure-2026-09-25.md)에
기록한다.
