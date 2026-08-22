# S1 — Semantic Projection과 Ask

content script의 document registration, semantic projection, stale ref 폐기, `model_ref` 변환과 Ask chat Side Panel을 구현한다. 사용자는 Options에서 서명된 Page Profile Resolver의 HTTPS endpoint, deployment ID, 허용 origin과 JWS public key ring을 설정하고 Side Panel에서 현재 페이지 Profile을 확인할 수 있다. 웹사이트 인증은 현재 Chrome session을 그대로 사용하되 agent가 cookie·Authorization header·password·OTP·recovery code·token을 읽거나 provider 요청에 포함하지 않는다. 로그인과 MFA는 사용자가 브라우저에서 직접 완료한다. S1 projection에는 CDP node/selector/coordinate/debugger state를 추가하지 않으며 CDP attach를 수행하지 않는다.

완료 조건: 실제 Chrome에서 labelled control, navigation, dynamic replacement, worker restart, Resolver Profile JWS 검증과 Ask chat request를 검증한다. Resolver가 없거나 서명이 틀리면 Profile을 사용하지 않고 fail closed한다. password, OTP, recovery code, token, cookie와 browser credential이 semantic projection, prompt, tool schema, audit와 diagnostics에 포함되지 않는 negative test를 수행하고 credential 화면에서는 redacted projection만 제공하거나 fail closed임을 확인한다.

S1의 projection은 최초 visible baseline이다. S6는 [schema v2 계약](../14-semantic-projection-fingerprint.md)에 따라 hidden DOM을 기본 `all_dom` read로 확장하지만 hidden target을 mutation mapping에 넣지 않는다. 이 확장은 S1 완료 증적을 소급 변경하지 않으며 S6의 별도 Chrome E2E로 검증한다.
