# S3 — LLM Provider Plugin Foundation

closed manifest schema, provider plugin API/registry/host, 내장 `contextpilot.openai-compatible` plugin, core HTTP transport, `chat_completions`/`responses`, 인증 없음과 API key header 세 방식(`Authorization: Bearer`, `api-key`, `x-goog-api-key`), 정적 header와 redacted 오류 처리를 구현한다. runtime plugin은 선언형 JSON만 설치하며 executable adapter는 extension build에 포함한다. 제품 계정과 provider OAuth/PKCE, token endpoint, scope, authorization code, access/refresh token lifecycle은 지원하지 않는다. plugin은 credential을 받거나 직접 network를 수행하지 않으며 core transport가 검증된 request plan에 인증 header를 마지막으로 주입한다.

완료 조건: manifest·version·migration negative test, plugin isolation, local fixture의 정확한 header/body/stream/cancel, secret 비노출과 plugin disable E2E를 검증한다. 허용되지 않은 auth scheme, OAuth/PKCE·token/refresh field, plugin credential 접근과 직접 network를 거부하고 세 API key header와 정적 header를 core만 정확히 주입함을 검증한다. header 중복, 빈 이름·값, CR/LF·제어 문자와 인증 header 충돌은 fail closed여야 한다. plugin manifest/adapter/response의 CDP method, selector, 좌표와 execution-path field는 거부하고 S2 browser authority를 확장하지 않음을 확인한다.

## 종료 재검증 행렬 (2026-09-25)

S3는 현재 31·33번 Ask/Act Provider turn을 기준으로 판정한다. 통제된 HTTPS
Provider fixture와 실제 Chrome for Testing Side Panel에서 요청을 관측한다.
운영 Provider·실제 계정 인증, S4 Settings/local network 운영 경로는 범위가
아니다.

1. closed manifest와 bundled adapter만 허용하고 schema/API/major version,
   legacy plugin ID alias와 구형 storage schema의 fail-closed, unknown field,
   executable URL, OAuth/PKCE·token
   field와 browser execution field를 음성 검증한다. plugin disable 뒤
   Provider turn은 전송 전에 실패해야 한다.
2. 현재 provider 설정의 `wire_api`·`api_key_header`는 resolved manifest의
   허용 집합 안에 있어야 한다. bundled adapter의 request plan은 closed
   relative path·body만 반환하며 credential이나 직접 network handle을
   받지 않는다. plan/response의 browser mutation authority는 거부한다.
3. `none`과 세 API key 방식의 정확한 outbound header/body를 검증한다.
   Core가 인증 header를 마지막에 주입하며 정적 header 중복·빈 값·제어
   문자·인증 충돌은 네트워크 전 실패한다. Provider 오류 상세는 status와
   고정 reason만 보존하고 원문 message/code를 반환하지 않는다.
4. 실제 Chrome fixture에서 `chat_completions`와 `responses`의 stream,
   Stop/cancel, plugin disable, storage/diagnostics 비노출을 확인한다.
   harness의 요청 관측은 제품 transport의 권한을 확장하지 않는다.

위 항목의 결과와 미검증 범위를 증거 문서에 나눠 기록한 뒤 `Completed`로
판정한다.

현재 종료 판정과 제한은 [S3 증거](../evidence/s3-closure-2026-09-25.md)에
기록한다.
