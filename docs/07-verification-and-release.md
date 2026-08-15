# 07. 검증, 보안 리뷰 및 출시 게이트

## 1. 자동 테스트 계층

| 계층 | 필수 검증 |
|---|---|
| Unit | origin matcher, mode/risk policy, model-ref mapping, content epoch registration, value-slot/digest binding, confirmation digest, redaction, fingerprint canonicalization, config schema, intent dedupe |
| Contract | tool/model-proposal/value-delivery JSON schema, runtime message allowlist, R2 binding IPC, native-host IPC, Page Profile JWS/resolver, Business MCP binding/result, bridge header forwarding, AI Hub error mapping |
| Extension fixture | 실제 Chrome DOM semantic projection/ref stability, content epoch registration/restart, controlled input, select, checkbox, modal, portal, stale ref, occlusion, navigation, `isTrusted` 거부 target |
| Security negative | R3 deny, Ask mutation deny, blocked-origin snapshot/LLM egress deny, policy/manifest mismatch, unknown profile deny, raw secret/audit leak, arbitrary message deny |
| Native Host | allowed extension ID, malformed framing, Windows SSO failure, header allowlist, named-pipe ACL/mutual authentication/replay deny, cancellation, no stdout diagnostics |
| Packaging | MV3 manifest permission snapshot, no Firefox artifact, no remote code, extension/host hash, signed update manifest |
| E2E | managed policy install, portal bootstrap path, SSO assertion, AI Hub call, R2 confirmation, VERIFIED/UNKNOWN behavior |

## 2. Tool 변경 테스트 매트릭스

각 tool에 대해 Ask/Act, allowed/blocked origin, known/unknown profile, R0~R3, confirmation approved/rejected/expired, verifier verified/failed/unknown, audit output을 최소 한 번씩 검사한다. model-exposed tool snapshot은 사람이 검토 가능한 고정 JSON으로 version control에 둔다.

## 3. 필수 보안 회귀

다음은 실패하면 출시를 막는 검사다.

1. model tool 목록에 비허용 tool 또는 CSS/XPath/execute-js가 존재함
2. Manifest에 broad host permission, 불필요 권한, remote code 경로가 존재함
3. Ask가 mutation을 통과하거나 Act가 allowlist 밖 origin에서 실행됨
4. R2가 확인 없이 실행되거나 R3가 실행 가능함
5. `UNKNOWN`이 자동 재시도됨
6. Page Profile 변경/만료 후 이전 도구가 남음
7. authoritative MCP 실패 후 모델이 대체값을 생성함
8. 로그/감사/오류에 secret, header value, raw page text, typed value가 존재함
9. Native Host가 다른 extension origin, 임의 URL, shell command를 수락함
10. 사용자가 정책으로 잠긴 LLM endpoint/model/header/origin을 UI나 local preference로 바꿀 수 있음
11. 비허용 origin에서 snapshot 수집, Profile resolver 호출 또는 LLM egress가 가능함
12. policy origin과 manifest host permission이 불일치해도 실행됨
13. bridge가 직접 호출, header/assertion 위조 또는 재전송을 수락함
14. 다른 session의 confirmation, stale value buffer 또는 value audit/LLM/Host 유입이 가능함
15. unsigned, expired, replayed 또는 profile 변경 중 이전 Profile이 action을 허용함
16. raw `ref_id`/mapping이 Host·LLM·audit에 있거나 unknown/consumed `model_ref` proposal이 internal target으로 해석됨
17. 등록되지 않은/늦은 document epoch, worker restart 뒤 미등록 epoch가 run에 사용됨
18. R2 binding IPC가 tab-context/epoch/session/digest/nonce/one-time consume 불일치를 수락함
19. Profile capability가 없는 synthetic click/key 또는 trusted-input 필요 target을 실행함
20. fingerprint golden vector·label alias·state capability·relation canonicalization 불일치, 현재 field/UI state 또는 forbidden field의 hash 유입, restart 뒤 lower/equal version replay 또는 durable replay store corruption을 허용함
21. Managed policy가 header key를 수락하거나 Host/bridge ACL 구성 밖 header가 사용됨
22. Profile resolver 또는 Business MCP가 query/fragment, raw DOM/ref/value, cookie 또는 browser header를 받음
23. profile 밖 field 또는 server/tool, arbitrary MCP endpoint/header, AI Hub assertion 재사용이 허용됨
24. `model_visibility` 또는 `user_visibility`가 거부한 authoritative value가 모델, Side Panel, audit, log, cache에 존재함
25. MCP timeout·late response·`NOT_FOUND`·`ACCESS_DENIED` 뒤 DOM/LLM fallback 또는 자동 재시도가 실행됨
26. 서명된 `UNKNOWN_PROFILE`에서 Business MCP tool이 노출되거나 Act가 허용됨
27. proposal 전 raw value 수집, wrong-context/expired/duplicate value slot consume, raw value의 model/Host/bridge/storage/audit/error 유입 또는 IPC 실패 뒤 value delivery 재전송이 허용됨

## 4. 릴리스 체크리스트

- [ ] Chrome MV3 build, lint, unit, fixture/E2E가 모두 통과했다.
- [ ] 모델 도구 snapshot과 Manifest permission snapshot을 보안 담당자가 승인했다.
- [ ] Managed Storage schema와 정책 JSON이 검증됐으며 user writable store와 분리됐다.
- [ ] Windows installer, Native Host registry/ACL, extension allowed origin을 깨끗한 VM에서 검증했다.
- [ ] SSO broker의 expiry/revocation/disabled Windows account 동작을 확인했다.
- [ ] AI Hub header ownership, rotation, rate limit, incident contact이 문서화됐다.
- [ ] 중지, bridge 단절, profile 실패, stale ref, UNKNOWN 시나리오가 fail closed 한다.
- [ ] data/privacy/security/IAM/operations 승인 기록이 남았다.
- [ ] rollback package와 policy disable 절차를 파일럿에서 검증했다.

## 5. 승인과 단계적 출시

출시는 Engineering, Security, IAM, AI Hub 운영, 개인정보/감사 소유자, Endpoint 운영의 승인 없이는 진행하지 않는다. 개발 환경의 성공은 production approval이 아니다. 파일럿은 별도 tenant/deployment ID, 제한된 allowlist, 낮은 rate limit, 즉시 rollback 가능한 정책으로 시작한다.

## 6. 구현 시작 전 결정 기록

다음 값은 설계에서 의도적으로 placeholder로 남긴 운영 입력이며, 구현 전에 확정해야 한다.

- AI Hub의 실제 bridge endpoint, wire, model ID, fixed header set
- Windows IWA/Kerberos와 SSO broker endpoint·assertion JWT 계약
- 회사 Chrome 관리 방식, extension ID, HTTPS update URL, installer 권한 모델
- 최초 enterprise origin allowlist와 Page Profile/MCP schema
- data owner, audit retention, incident/rollback 책임자

값이 비어 있으면 해당 기능은 임의 기본값으로 동작하지 않고 시작 시 fail closed 해야 한다.
