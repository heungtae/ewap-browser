# Browser / Platform 계약 정렬 backlog

2026-09-06 정렬 검토에서 남은 교차 저장소 계약 과제를 보존한다. 아래 비교는 당시
기준선이며 현재 Platform 구현·배포·호환성을 다시 검증한 결과가 아니다.
현재 Browser 동작의 SSOT는 [코드](source-guide.md)다. 기존 AS-IS/TO-BE 인벤토리는
이 문서의 Git 이력에서 확인한다.

## 후속 작업의 경계

계약 변경을 시작할 때 Workspace 계약, Platform producer, Browser consumer의
현재 revision과 schema를 다시 비교한다. 합의한 공유 계약은 목표 호환성을 정의하며,
Browser의 실제 지원은 consumer 코드와 실행 결과로 확인한다. 계획에 맞추려고
이미 서명된 응답을 변환하거나 지원하지 않는 step·transport를 조용히 버리지 않는다.

[Community / Enterprise 후속 계획](sprints/community-release-enterprise-followup.md)의
C03/C04·E01~E08은 설치·배포·계약·실제 통합의 남은 범위다. 당시의 완료/미완료
기록은 해당 날짜의 [증거](evidence/README.md)와 함께 읽고 현재 상태를 재확인한다.

| 현재 consumer를 확인할 위치       | 코드                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page Profile와 서명 응답          | [profile types](../extension/src/profile/profile-types.ts), [Resolver](../extension/src/profile/resolver.ts), [JWS](../extension/src/profile/jws.ts)                            |
| Workflow 지원 vocabulary와 bounds | [validator](../extension/src/contracts/workflow.ts)                                                                                                                             |
| Business MCP binding·전송         | [binding](../extension/src/profile/mcp-binding.ts), [client](../extension/src/profile/business-mcp-client.ts)                                                                   |
| managed policy·evidence           | [policy](../extension/src/policy/enterprise-policy.ts), [sink](../extension/src/service-worker/runtime-evidence.ts), [managed schema](../extension/managed-storage-schema.json) |
| observation fingerprint           | [fingerprint](../extension/src/profile/fingerprint.ts)                                                                                                                          |

아래 C01~C09의 식별자는 후속 계획의 참조를 유지하기 위해 보존한다. `ewap/v1`과
Platform 표기는 2026-09-06 비교 대상이며 현재 Browser 준수 여부를 선언하지 않는다.

## 8. Contract gaps

These are **future ewap-workspace change candidates**. Workspace contracts and Platform files are unchanged. Decisions require the workspace contract owner, Platform producer and Browser consumer.

| ID  | Conflict / omission                                                                                                                                                                                                                  | Required decision and migration                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | Workspace PageProfile uses ewap/v1, metadata, match.urls/domains and page. Platform uses enterprise-web-ai/v1alpha1, match.pageId/urlPatterns, business/elements/actions. Browser uses schema_version 1, matcher and integer version | Define source/consumer mapping or a new API version using workspace as authority. Integer and SemVer versions are not simple interchangeable strings                |
| C02 | Shared Workflow spec.start/steps.type/with vs Platform WorkflowDefinition entryStepId/CEL/step vocabulary vs Browser inline three-tool, 12-step declaration                                                                          | Specify supported subset, reference pins, outcomes and limits. Do not discard or flatten unsupported steps                                                          |
| C03 | Shared PageProfile.mcpServers requires id/name/url/transport/tools; McpServer also requires authentication. Platform source is logical serverRef-only. Shared enum lacks proprietary HTTP                                            | Define source vs distribution view, governed URL semantics and versioned PROFILE_BOUND_HTTP_V1 representation. HTTPS does not imply streamable-http                 |
| C04 | Shared EnterprisePolicy allow/deny/domain/server/tool/approval differs from current PDP body. Platform risks are READ/LOW_WRITE/BUSINESS_WRITE/PRIVILEGED_WRITE/CRITICAL; Browser uses R0–R3                                         | Define deny precedence, allow-list intersection, risk/effect mapping, approval expiry and managed-mode admission                                                    |
| C05 | Optional shared security.signature has algorithm/keyId/value; Platform uses flattened release JWS; Browser uses compact JWS and per-request nonce                                                                                    | Define signed scope, typ/envelope, keys/issuer/trust, digest encoding, source/release identity and runtime proof. Never reuse a signature over a different envelope |
| C06 | No shared resolve/artifact/trust/PDP/audit/capture wire schemas                                                                                                                                                                      | Review Platform proposals into shared contracts: auth audiences, stable errors, event IDs/receipts/idempotency/retention and failure rules                          |
| C07 | Browser semantic-projection-fp-v1 uses visible-node order/label categories; Platform semantic-v1 uses names/cardinality/visibility and different normalization                                                                       | Versioned observation adapter, parallel algorithms, INCOMPARABLE and golden vectors; no direct digest comparison or automatic baseline replacement                  |
| C08 | Workspace allows x- fields and general version strings; Platform/Browser are closed and more restrictive                                                                                                                             | Specify extension handling, version grammar and unsupported mandatory-feature rejection; no silent x- stripping                                                     |
| C09 | Compatibility record has unknown product versions; integration hooks absent                                                                                                                                                          | Record supported schema/adapter/Chrome/Platform combinations, migration/rollback evidence and ownership                                                             |

Preserve Platform ownership of DB, signing and governance while respecting workspace authority. C01–C08 do not declare either existing product conformant to ewap/v1. A new version or explicitly approved temporary adapter is required for incompatible changes.
