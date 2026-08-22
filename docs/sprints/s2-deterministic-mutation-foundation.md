# S2 — 실행 승인과 Bounded CDP Mutation

capability × host 권한 카드, once/always/deny 저장, 철회와 navigation 경계, R0-R3 위험 분류, preflight, text/select 값 입력, 결과적 행동 확인, DOM executor, Level 2 bounded CDP adapter, Stop과 verifier를 구현한다. 웹사이트가 현재 Chrome session으로 인증됐다는 사실은 agent 행동 인가가 아니며 모든 mutation은 별도 permission gate를 통과한다. R2 confirmation은 현재 intent·run·target·value digest·document에 결속하고 일반 편의 설정으로 우회할 수 없으며 R3는 기본 거부한다. provider와 plugin capability는 browser 권한을 추가하지 못한다.

bounded CDP는 `docs/15-bounded-cdp-adapter.md`의 `DOM.*`/`Input.*` allowlist만 사용하며 action-scoped attach/detach, current document/ref binding, token 유일성/hit test와 dispatch 후 no-fallback/no-retry를 지켜야 한다. raw command, JavaScript, screenshot, Network/Target domain과 model/page/site-adapter 지정 selector·좌표는 범위 밖이다.

S7는 이 executor를 generic browser Act tool에 연결하고 S8은 permission mode를 추가한다. 둘 다 S2의 credential/R2/R3/binding/preflight/no-retry/verifier 경계를 유지한다. S6 screenshot/zoom은 별도 read capability이며 이 mutation CDP allowlist를 확장하지 않는다.

완료 조건:

- click/type/navigation/download/network write의 권한 경계와 submit 재확인 Chrome E2E
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
