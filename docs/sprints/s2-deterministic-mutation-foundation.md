# S2 — 실행 승인과 Bounded CDP Mutation

capability × host 권한 카드, once/always/deny 저장, preflight, text/select 값 입력, 결과적 행동 확인, DOM executor, Level 2 bounded CDP adapter, Stop과 verifier를 구현한다.

bounded CDP는 `docs/15-bounded-cdp-adapter.md`의 `DOM.*`/`Input.*` allowlist만 사용하며 action-scoped attach/detach, current document/ref binding, token 유일성/hit test와 dispatch 후 no-fallback/no-retry를 지켜야 한다. raw command, JavaScript, screenshot, Network/Target domain과 model/page/site-adapter 지정 selector·좌표는 범위 밖이다.

완료 조건:

- click/type/navigation/download/network write의 권한 경계와 submit 재확인 Chrome E2E
- synthetic input 거부 control의 trusted click/key/text와 semantic verifier
- R2 confirmation 전 attach/dispatch 0
- unknown command/parameter, stale/cross-tab target, duplicated token, sensitive/occluded target 거부
- 미승인/restricted origin의 debugger attach 호출 0
- competing debugger conflict와 dispatch 전/후 failure classification
- Stop, navigation, tab close, worker restart와 모든 terminal path 뒤 product-owned attached session 0
- detach failure tab 격리와 다른 debugger를 detach하지 않는 recovery
- external E2E CDP와 product CDP allowlist의 분리
