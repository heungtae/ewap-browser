# 07. 검증, 보안 리뷰 및 출시 게이트

## 1. 자동 테스트 계층

| 계층 | 필수 검증 |
|---|---|
| Unit | origin matcher, mode/risk policy, confirmation digest, redaction, config schema, intent dedupe |
| Contract | tool JSON schema, runtime message allowlist, native-host IPC, bridge header forwarding, AI Hub error mapping |
| Extension fixture | AX/ref stability, controlled input, select, checkbox, modal, portal, stale ref, occlusion, navigation |
| Security negative | R3 deny, Ask mutation deny, unknown profile deny, raw secret/audit leak, arbitrary message deny, static header override deny |
| Native Host | allowed extension ID, malformed framing, Windows SSO failure, header allowlist, cancellation, no stdout diagnostics |
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
