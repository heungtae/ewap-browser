# S1 — Semantic Projection과 Ask

content script의 document registration, semantic projection, stale ref 폐기, `model_ref` 변환과 Ask chat Side Panel을 구현한다. 사용자는 Options에서 서명된 Page Profile Resolver의 HTTPS endpoint, deployment ID, 허용 origin과 JWS public key ring을 설정하고 Side Panel에서 현재 페이지 Profile을 확인할 수 있다. 웹사이트 인증은 현재 Chrome session을 그대로 사용하되 agent가 cookie·Authorization header·password·OTP·recovery code·token을 읽거나 provider 요청에 포함하지 않는다. 로그인과 MFA는 사용자가 브라우저에서 직접 완료한다. S1 projection에는 CDP node/selector/coordinate/debugger state를 추가하지 않으며 CDP attach를 수행하지 않는다.

완료 조건: 실제 Chrome에서 labelled control, navigation, dynamic replacement, worker restart, Resolver Profile JWS 검증과 Ask chat request를 검증한다. Resolver가 없거나 서명이 틀리면 Profile을 사용하지 않고 fail closed한다. password, OTP, recovery code, token, cookie와 browser credential이 semantic projection, prompt, tool schema, audit와 diagnostics에 포함되지 않는 negative test를 수행하고 credential 화면에서는 redacted projection만 제공하거나 fail closed임을 확인한다.

S1의 projection은 최초 visible baseline이다. S6는 [schema v2 계약](../14-semantic-projection-fingerprint.md)에 따라 hidden DOM을 기본 `all_dom` read로 확장하지만 hidden target을 mutation mapping에 넣지 않는다. 이 확장은 S1 완료 증적을 소급 변경하지 않으며 S6의 별도 Chrome E2E로 검증한다.

2026-09-24 종료 재검증에서는 현재 Content Script 메시지 계약에 없는
`CONTENT_DEVTOOLS_LOG` relay를 Chrome preview runner의 종료 gate에서
제거한다. 실제 `START_PREVIEW` projection, credential redaction,
stale target 및 navigation 검증은 유지한다. 디버그 로그 relay 성공을
S1 기능 완료로 주장하지 않는다.

## S1 종료 재검증 시나리오 (2026-09-24)

S1 전용 Chrome runner는 다음을 실제 unpacked Extension의 Side Panel과
HTTPS 통제 fixture에서 검사한다. S2/S7의 action dispatch는 호출하지 않는다.

1. labelled control과 민감 입력이 섞인 페이지의 초기 projection에서
   password·OTP·token·cookie 값이 제외되고 `model_ref`가 raw DOM 경로를
   노출하지 않는다.
2. Resolver 설정 부재, 정상 ES256 JWS, 서명 손상 순서로
   `RESOLVE_PROFILE`을 호출한다. 정상 응답만 `MATCHED`이며 실패는
   `PROFILE_UNAVAILABLE`로 닫는다.
3. 실제 Ask를 통제 Provider로 보내 답변을 확인하고 Provider 요청의
   projection/tool schema에 민감 marker가 없는지 검사한다.
4. 같은 문서의 control 교체, 다른 path navigation, Service Worker 종료
   뒤 재시작에서 이전 ref/document identity 재사용을 거부하고 새
   projection을 얻는다.

각 검사는 구별되는 실패 코드를 남긴다. Chrome runtime 증거와 unit/schema
검증을 상태 원장에 연결한 뒤 S1 `Completed`를 판정한다.

Chrome 검증에서 `ProfileResolver`가 전달받은 `fetch`를 인스턴스 메서드로
호출해 `WorkerGlobalScope`의 `Illegal invocation`이 발생함을 확인했다.
Resolver HTTPS 호출은 Service Worker global을 receiver로 사용하고
browser credential을 제외해야 한다. 수정 뒤 정상 JWS가 도달·검증되고
손상 JWS만 거부됨을 [S1 증거](../evidence/s1-closure-2026-09-24.md)로
확인했다. 실패 응답에는 endpoint나 원문을 넣지 않는다.
