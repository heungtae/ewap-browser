# Codex CLI Implementation Task Plan --- Enterprise Web AI Alignment

## Goal

기존 ContextPilot Browser Runtime을 폐기하지 않고 **Enterprise Web AI
Platform Data Plane**으로 승격한다. 현재 Semantic Projection을 runtime
observation SSoT로 유지하고, Signed Page Profile·MCP
Registry/Discovery·Enterprise Policy/RBAC·Runtime Evidence·Enterprise
Studio를 계층적으로 결합한다.

## Non-negotiable runtime invariants

-   LLM은 raw selector/XPath/DOM·CDP node ID/coordinate/arbitrary CDP
    method를 직접 지정하지 않는다.
-   `Current Semantic Projection > Signed Page Profile > user intent > page/MCP/vision content`의
    사실/신뢰 경계를 유지한다.
-   Page/MCP/Vision/Tab content는 untrusted data이며 instruction
    authority가 아니다.
-   DOM-first, bounded CDP only; dispatch 후 fallback/automatic retry
    금지.
-   WRITE/PRIVILEGED/CRITICAL은 verifier 확인 전 성공이 아니며
    불명확하면 `UNKNOWN`.
-   Enterprise PDP의 ALLOW도
    credential/sensitive-target/stale-binding/closed-allowlist/preflight/verifier/local
    hard guard를 우회하지 못한다.

## Work packages

1.  **S10 Profile Runtime** --- `page-profile.schema.json`, validator,
    signature verify/revoke, `ProfileResolverPort`, semanticId→current
    runtime ref resolution, verifier binding.
2.  **S11 MCP Registry** --- `serverRef`
    registry(endpoint/transport/auth/trust/env), `tools/list`
    discovery/cache, capability/risk overlay, Profile
    `capabilityPolicy/toolOverrides`, final LLM-visible catalog. Tool
    schema는 MCP Server가 authoritative.
3.  **S12 Enterprise Policy/Identity** --- SSO auth context adapter,
    RBAC/PDP client, READ/WRITE/PRIVILEGED/CRITICAL↔R0-R3 mapping,
    approval token binding, policy-controlled `managed-auto`,
    required-policy outage fail-closed.
4.  **S13 Runtime Evidence/Audit** --- redacted
    `AuditEvent`/RuntimeEvidence,
    organization/user/profile/workflow/policy/MCP correlation. raw
    page/prompt/value/ref/node/coordinate/secret 저장 금지.
5.  **S14 Studio Integration** --- capture evidence(Semantic
    Projection/DOM/network/user trace), L0\~L6 validation hooks,
    semantic fingerprint export, dependency metadata, Change
    Detector/Impact Analyzer regression selection.
6.  **S15 Enterprise Release** --- Managed Chrome config/force-install,
    KMS/HSM trust adapter, signed publish/revoke/rollback,
    on-prem/air-gap, Windows/Linux clean-profile evidence.

## Definition of Done

각 package는 contract/schema → unit/negative test → fixture/integration
→ Chrome E2E → evidence 순서로 완료한다. 최소 negative set:
tampered/revoked Profile, ambiguous/stale/cross-tab ref, sensitive
target, raw selector/coordinate/CDP injection, prompt injection, MCP
capability bypass, PDP outage write, pre-confirmation dispatch,
post-dispatch retry, debugger conflict, detach failure/quarantine,
verifier no-change, secret/audit leakage. 문서만 수정하거나 mock test만
통과한 상태를 Done으로 표시하지 않는다.

## Codex task creation rule

위 Work package를 Epic으로 만들고 각 bullet을 독립 Task로 분해한다.
Task마다 **Affected modules / Contract change / Acceptance tests /
Chrome evidence / Security negative tests / Migration impact / Docs to
update**를 포함한다. 기존 S0\~S9 behavior와 public message/storage
schema는 명시적 migration task 없이 깨지지 않게 유지한다.
