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

1.  **S10 Browser 로컬 Profile 수락** --- 현행 compact JWS의 claim/path/
    version 검증과 Worker 재시작을 견디는 replay high-water. Workspace
    schema, Platform release·철회, semanticId→현재 runtime ref는 이
    완료 범위에 포함하지 않는다.
2.  **S11 Browser 로컬 Business MCP binding** --- 현행 signed Profile의
    closed endpoint/tool/argument, 호출 직전 page/Profile 재검사,
    bounded result와 모델 catalog 비노출. Registry `tools/list`,
    Gateway, policy/release binding은 현재 완료 범위 밖의 Platform 계약이다.
3.  **S12 Browser 로컬 managed policy 경계** --- 손상된 managed 설정과
    PDP deny/outage·잘못된 응답은 fail-closed, Act의 로컬 permission은
    PDP allow 뒤에도 유지. SSO/RBAC, 조직 risk mapping, 중앙 approval,
    `managed-auto`는 인증된 Platform 계약이 없어 완료 범위에서 제외한다.
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

각 package는 해당 범위의 contract/schema → unit/negative test →
fixture/integration → Chrome E2E → evidence 순서로 완료한다. 아래
negative set은 Enterprise 전체 작업의 목표이며 S10 Browser 로컬
완료 판정에 소급하지 않는다:
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
