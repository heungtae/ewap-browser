# Company Web Agent 스프린트 개발 계획

## 운영 원칙

- 각 Sprint는 하나의 mergeable delivery increment이며, 선행 Sprint의 종료 게이트를 통과해야 시작한다.
- `sprint-status.md`가 진행 상태와 완료 증적의 단일 기준이다. 이 계획은 상태를 대신하지 않는다.
- 모든 browser mutation은 실행 전 deterministic authorization, 실행 후 verifier를 가져야 한다. `UNKNOWN` 결과는 자동 재시도하지 않는다.
- 모델은 action 제안만 하며 enterprise authorization, origin 판단, risk 판단, tool exposure는 모두 결정적 코드가 담당한다.
- 개발 항목이 아닌 문서·baseline 조사도 Sprint 0 산출물로 증적을 남긴다.

## Sprint 흐름

```text
S0 Baseline & delivery foundation
  -> S1 Enterprise lockdown
  -> S2 Policy and mutation control plane
  -> S3 Verified core form automation
  -> S4 Audit and evidence pipeline
  -> S5 Side panel operational UX
  -> S6 Security and resilience hardening
  -> S7 Page Profile MCP control plane
  -> S8 AI evaluation and release qualification
```

S7은 S1~S4의 보안 경계와 검증 체계가 고정된 뒤 시작한다. S8은 모든 선행 Sprint가 `Done`이고 변경 범위가 동결된 뒤에만 시작한다.

## Sprint 상세

각 Sprint의 설계, work breakdown, 테스트 케이스와 산출물 형식은 [Sprint별 상세 계획](sprints/README.md)을 기준으로 한다. 이 문서는 의존성·범위·종료 게이트의 상위 로드맵이며, 상태 변경은 계속 [상태 기록부](sprint-status.md)에서만 수행한다.

### S0 — Baseline & Delivery Foundation

**목적:** upstream 기준점을 재현 가능하게 고정하고 이후 변경을 비교할 문서·증적 기반을 만든다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | 없음 |
| 범위 | pinned upstream checkout, build/lint/unit/extension-load 기준선, runtime/tool/provider/permission inventory, license/SBOM 접근 계획 |
| 비범위 | 기능 변경, dependency upgrade, 대규모 리팩터링 |
| 필수 산출물 | `BASELINE.md`, runtime/tool/provider/permission inventory, tool/manifest snapshot baseline, 실행 명령과 실패 기록 |
| 완료 증적 | 재현 가능한 명령·환경·commit pin, 실제 결과 로그/CI 링크, upstream 대비 inventory 검토 |
| 승인 역할 | Extension lead, QA lead, Security lead |

### S1 — Enterprise Lockdown

**목적:** 범용 WebBrain surface를 사내용 최소 권한·단일 provider·ASK/ACT 구조로 축소한다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | S0 Done |
| 범위 | MV3 permission/host permission 축소, company vLLM 고정, managed configuration, COMPANY_TOOLS, origin allowlist, ASK read-only/ACT 제한 |
| 금지 항목 | arbitrary JS/fetch, download/upload, scheduler, cloud sync/provider, OAuth subscription, CAPTCHA, WebMCP, social automation 재활성화 |
| 완료 증적 | manifest diff/snapshot, model-exposed tool snapshot, provider egress policy test, ASK mutation denial, external-origin ACT denial |
| 승인 역할 | Security lead, Extension lead, Privacy/AI governance owner |

### S2 — Policy & Mutation Control Plane

**목적:** 이후 action tool이 우회할 수 없는 deterministic authorization path를 확립한다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | S1 Done |
| 범위 | capability/risk classifier R0~R3, R2 blocking confirmation, R3 hard deny, duplicate mutation identity/guard, tool registry enforcement |
| 완료 증적 | policy unit tests, direct tool invocation denial tests, confirmation approve/deny tests, R3 deny test, duplicate mutation test |
| 완료 판단 | prompt나 모델 출력만으로 risk/confirmation/origin을 우회할 수 없음을 테스트로 증명 |
| 승인 역할 | Security lead, Product owner, QA lead |

### S3 — Verified Core Form Automation

**목적:** 최소 UI action surface를 accessibility-tree `ref_id` 중심으로 안전하게 제공한다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | S2 Done |
| 범위 | `set_field`, `set_checked`, native select, ARIA combobox/portal popup, controlled input, radio/textarea; tool별 verifier |
| 제약 | CSS/XPath는 fallback만 허용, 각 tool은 schema·registry·mode·capability·risk·confirmation·verifier·redaction·unit·browser E2E를 함께 갱신 |
| 완료 증적 | fixture + extension E2E, verifier assertion, stale-ref/UNKNOWN 결과 확인, mutation 자동 재시도 없음 |
| 승인 역할 | Extension lead, QA lead, Security lead |

### S4 — Audit & Evidence Pipeline

**목적:** action lifecycle을 추적 가능하게 하되 secret 및 원문 페이지 데이터를 노출하지 않는다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | S3 Done |
| 범위 | audit event schema, redaction, correlation, local retention/optional enterprise forwarding policy, evidence export format |
| 금지 | password, OTP/MFA, token, cookie, Authorization header, full typed value, raw page text 기록 |
| 완료 증적 | redaction tests, event schema validation, mutation-to-audit coverage report, retention/access decision record |
| 승인 역할 | Security lead, Privacy owner, Operations owner |

### S5 — Side Panel Operational UX

**목적:** 사용자가 mode, policy result, confirmation, 실행 상태를 오해 없이 통제하도록 한다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | S4 Done |
| 범위 | ASK/ACT selector, origin/profile status, action timeline, R2 confirmation, Stop, connection/degraded state, settings surface 축소 |
| 완료 증적 | UX/browser E2E, confirmation accessibility review, Stop 후 debugger detach evidence, unsupported-action messaging tests |
| 승인 역할 | Product owner, Accessibility reviewer, Security lead |

### S6 — Security & Resilience Hardening

**목적:** hostile page, failure, lifecycle 경로에서 fail-closed 동작을 검증한다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | S5 Done |
| 범위 | prompt injection, hidden overlay, malicious iframe, external navigation, stale ref, malformed call, duplicate submit, secret leak, CDP detach, timeout/recovery |
| 완료 증적 | security regression suite, threat-model residual-risk review, severity triage/closure record, performance and memory measurements |
| 완료 판단 | high/critical security regression 0건, accepted residual risk는 ADR 또는 risk acceptance에 기록 |
| 승인 역할 | Security lead, QA lead, Release owner |

### S7 — Page Profile MCP Control Plane

**목적:** LLM과 분리된 deterministic page resolution 및 page-scoped business tool exposure를 구현한다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | S1, S2, S3, S4, S6 Done |
| 범위 | semantic fingerprint, profile resolver/cache/versioning, dynamic tool revoke, deterministic authoritative binding, MCP response schema validation |
| 실패 정책 | unknown profile은 ACT deny; profile MCP 실패는 valid cache가 없으면 fail closed; authoritative Business MCP 실패는 LLM 추측 금지 |
| 완료 증적 | fingerprint privacy tests, resolver/cache/SPA transition tests, profile tool-isolation test, outage/fail-closed test, profile governance review |
| 승인 역할 | AI/MCP owner, Security lead, Business system owner, QA lead |

### S8 — AI Evaluation & Release Qualification

**목적:** 모델 품질과 browser correctness를 분리해 검증하고 운영 배포 가능 여부를 결정한다.

| 항목 | 계획 |
|---|---|
| 선행 조건 | S0~S7 Done, release candidate scope freeze |
| 범위 | Qwen/vLLM tool-calling evaluation, safety evaluation, release test execution, SBOM/license, deployment/rollback rehearsal, monitoring/runbook review |
| 최소 release 기준 | tool selection >= 95%, invalid arguments <= 1%, unsafe action without confirmation = 0, destructive auto execution = 0, secret audit leak = 0 |
| 완료 증적 | versioned evaluation dataset/results, all required test reports, permission/tool snapshots, SBOM, rollout/rollback proof, approval record |
| 승인 역할 | Release owner, Security lead, AI governance owner, Product owner, Operations owner |

## Sprint 변경 및 분할 규칙

1. Sprint의 보안 invariant를 약화시키는 변경은 해당 Sprint 안에서 해결하지 않고 ADR과 security review를 먼저 거친다.
2. 기능이 커지면 같은 acceptance criteria를 공유하는 작은 work item/PR로만 분할하며, Sprint 완료 증적은 통합 결과로 기록한다.
3. blocker는 `Blocked`로 즉시 기록하고, 해결되지 않은 risk를 `Done`으로 숨기지 않는다.
4. S8 이후 production change는 동일한 ledger 형식의 release sprint 또는 hotfix record를 만든다.
