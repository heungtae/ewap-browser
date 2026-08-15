# S5 — Profile/MCP·Managed Pilot

## 1. 목표와 종료 시 보이는 결과

현재 exact page에 결속된 signed Page Profile과 Business MCP를 trusted Host 경계에 연결하고, production Ask/Act의 최종 gate와 관리형 패키지·rollback을 파일럿 후보 수준으로 검증한다. 종료는 자동·VM 증거와 승인 기록을 갖춘 release candidate를 뜻하며 전체 조직 production 승인을 자동으로 뜻하지 않는다.

## 2. 착수 조건과 입력

- S4가 증거와 commit hash를 가진 `Completed`다.
- Profile signing key ring, deployment ID, resolver audience/endpoint, MCP Registry와 별도 assertion audience의 owner가 정해졌다.
- production extension/Host/package signing, managed policy, portal install, update/rollback 소유자가 정해졌다.
- Security, IAM, AI Hub, Endpoint, Data owner의 승인 증거 위치와 release decision owner가 정해졌다.

입력이나 승인 owner가 없으면 해당 integration/release gate를 `Blocked`로 두며 샘플 값으로 production 성공을 만들지 않는다.

## 3. 포함 범위

- `semantic-projection-fp-v1` canonicalizer와 visibility identity
- exact-page context digest와 request nonce에 결속된 Profile JWS 검증
- key rotation, expiry, size, matcher, idempotent durable high-water CAS와 atomic cache
- SPA path/visibility/semantic 변화의 tool 철회와 profile 재해결
- authoritative field와 `agentic-read`의 두 closed Business MCP call kind
- Host-owned MCP Registry route, 별도 assertion, visibility/audit/late-response enforcement
- verified Profile + trusted Host 뒤 production Ask/Act feature gate
- package/update manifest/managed policy/Host installer compatibility와 hash capture
- health check, rollback, clean VM checklist, pilot runbook와 approval evidence link

## 4. 명시적 제외와 feature gate

- unsigned/unknown/expired/mismatched Profile의 Act
- Profile/Registry 밖 server, tool, field, route, header와 arbitrary MCP probing
- MCP 실패 뒤 다른 tool/server, DOM, LLM fallback 또는 자동 재시도
- AI Hub assertion을 Business MCP에 재사용
- 승인과 clean VM/rollback 증거 없는 전체 조직 배포
- R3, trusted-input 우회, profile에 선언되지 않은 mutation capability

서명된 `UNKNOWN_PROFILE`은 Ask의 basic-read-only만 허용하고 Act와 Business MCP를 거부한다. verified Profile이 있어도 release gate 미충족이면 파일럿 배포는 NO-GO다.

## 5. 핵심 설계 계약

1. resolver request는 allowlisted origin/path class, value-free fingerprint, one-time nonce와 privacy-preserving exact-page digest만 보낸다. query/fragment/cookie/raw DOM/ref/value를 보내지 않는다.
2. Host high-water key는 `(deployment_id, profile_id)`다. higher version은 advance, same version+same signed definition digest는 idempotent accept, same version+different digest와 lower version은 거부한다.
3. fingerprint가 같은 다른 record라도 JWS, subject, cache와 response는 exact-page context가 다르면 교차 사용할 수 없다.
4. visibility membership 변화, path 변화 또는 major semantic 변화는 이전 Profile/tool을 즉시 철회하고 pending action/MCP response를 폐기한다.
5. mutation effect/risk와 closed verifier, synthetic activation capability, trusted-input deny는 Profile의 signed declaration만 따른다.
6. authoritative field와 agentic-read는 서로 다른 closed request/response schema를 사용한다. model enum, result key/kind와 scalar visibility를 Registry/Profile 양쪽에서 검증한다.
7. Host만 MCP Registry route와 별도 SSO assertion을 소유한다. timeout, access failure, malformed/late response는 fail closed다.
8. extension package, update manifest, policy, Host, installer는 하나의 compatibility matrix와 hash evidence로 묶이고 rollback 뒤 tool/Host 비활성화를 확인한다.

## 6. 작업 패키지

| 카드 | 결과 | 대표 negative case |
|---|---|---|
| S5-1 | fingerprint/JWS/CAS/cache | canonical drift, cross-record, bad signature/expiry/version/store corruption |
| S5-2 | resolver/Profile/MCP two-call-kind adapter | profile 밖 route/tool, subject crossing, fallback, result mismatch, late response |
| S5-3 | package/policy/Host compatibility validator | hash/version/header-key mismatch |
| S5-4 | installer, health, rollback, VM checklist | rollback 뒤 tool/Host 잔존 |

상세 파일 경계는 [12의 S5 카드](../12-low-cost-agent-implementation-spec.md#s5-카드)를 따른다.

## 7. 검증과 종료 증거

- Profile signature/binding/version/cache/fingerprint와 exact-record isolation contract test가 통과한다.
- authoritative/agentic 두 call kind의 valid/invalid wire fixture와 visibility/audit/late-response negative test가 통과한다.
- package, update manifest, policy, Host와 installer hash/compatibility 검사가 통과한다.
- clean Windows VM에서 managed install, Host registry/ACL, health, policy disable과 rollback을 확인한다.
- [07의 release checklist](../07-verification-and-release.md#4-릴리스-체크리스트)와 named owner 승인 증거를 상태 원장에 연결한다.

정확한 검증 항목은 [10의 S5 검증](../10-sprint-verification-plan.md#7-s5-검증)을 따른다.

## 8. 종료와 release decision

S5 개발 범위는 모든 필수 자동·VM 검증과 독립 commit hash가 상태 원장에 기록될 때 `Completed`가 될 수 있다. production/file pilot GO는 별도 release decision이다. Security/IAM/AI Hub/Endpoint/Data owner 승인, 운영 환경 검증, 배포·rollback rehearsal 중 하나라도 없으면 상태 원장에 blocker와 owner를 남기고 release는 NO-GO로 유지한다.

## 9. 설계 추적

- Page Profile/MCP 실행 흐름: [01](../01-architecture.md)
- effect/risk/tool policy: [02](../02-security-policy.md)
- trust/cache/revocation: [03](../03-extension-design.md)
- deployment/rollback: [05](../05-deployment-operations.md)
- release gate: [07](../07-verification-and-release.md)
- closed resolver/MCP contract: [13](../13-page-profile-and-business-mcp-contract.md)
- fingerprint contract: [14](../14-semantic-projection-fingerprint.md)
- 개발 계획: [09의 S5](../09-sprint-development-plan.md#7-s5--profilemcp배포파일럿-준비)
