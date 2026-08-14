# S7 — Page Profile MCP Control Plane

## 1. 설계 계획

- **목표:** semantic Accessibility Fingerprint로 page profile을 deterministic하게 해석하고 profile-scoped Business MCP tool만 노출한다.
- **선행 조건:** S1, S2, S3, S4, S6 Done.
- **연계 요구사항:** RQ-12, RQ-13, RQ-14.
- **필요 ADR:** ADR-013.
- **불변 조건:** raw AX tree/value/ref_id/coordinate/secret는 Profile MCP에 보내지 않는다. unknown profile은 ACT deny, page transition은 이전 business tool을 즉시 revoke, authoritative value failure는 model guess 금지다.
- **비범위:** profile auto-publish, LLM-based production resolver fallback, Page Profile을 user authorization source로 사용.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | fingerprint schema와 sanitization/matching signals를 확정 | versioned fingerprint contract | AI/MCP + Security |
| 2 | profile MCP client, schema validation, timeout/error model을 설계 | client contract | AI/MCP + Extension |
| 3 | cache key/TTL/invalidation and SPA change detection을 설계 | cache/resolution model | Extension |
| 4 | dynamic tool exposure/revocation과 policy intersection을 연결 | context-router/tool filter | Extension + Security |
| 5 | authoritative binding과 business MCP failure behavior를 설계 | binding contract | Business owner + AI/MCP |
| 6 | profile publish/RBAC/version/rollback governance를 문서화 | profile operations record | Operations + Security |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Unit | fingerprint sanitization, schema validation, scoring/cache invalidation | values/secrets 제외, deterministic result | unit report |
| Integration | exact/fuzzy/ambiguous/unknown and cache outage | no-cache outage/unknown은 ACT deny | resolver test report |
| Browser E2E | SPA profile transition and old-tool revoke | previous business tool exposure=0 | E2E report |
| Security | tool isolation, invalid profile response, authoritative MCP failure | cross-profile leakage=0, model guess=0 | negative test/review |

## 4. 종료 조건과 기록

- [x] profile resolution과 dynamic exposure가 LLM 없이 동작함을 증명했다.
- [x] privacy, outage, revocation, authoritative binding failure 증적과 [operations record](S7-page-profile-operations.md)가 있다.
- [x] ADR-013, RQ-12/13/14, 상태 기록부를 갱신했다.
