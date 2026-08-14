# Company Web Agent RC1 qualification — 2026-08-15

## Decision

**NO-GO for production deployment.** The local release candidate is technically qualified for the deterministic boundaries listed below, but cannot be promoted until the managed Qwen/vLLM endpoint, managed Page Profile MCP service and named Security/AI governance/Operations approvals are available. This is an explicit fail-closed release decision, not a risk acceptance.

## Locked local evidence

| Area | Result | Evidence |
|---|---|---|
| deterministic contract safety | 6/6 passed | [contract report](../../artifacts/release/company-contract-evaluation-2026-08-15.json) |
| company policy/unit snapshot | passed | `npm run test:company` |
| browser fixtures | passed | `npm run test:fixtures` |
| extension CI dry run | passed | `npm run ci:e2e:dry` |
| upstream regression suite | passed | `npm test` |
| dependency inventory | 5 locked components | [SBOM](../../artifacts/release/company-sbom-2026-08-15.json) |

## Version and data record

- Application: `webbrain@31.0.1`; upstream baseline `ec76e498ee38a827d6bafc4838cc44f40ea08cd9`.
- Provider contract: managed `company-vllm`, `Qwen3.5-32B-Instruct`, fixed `https://ai.company.net/v1` class; no credential is recorded here.
- Tool schema: `COMPANY_TOOLS` snapshot enforced by `test/company/tool-snapshot.test.mjs`.
- Dataset: `company-contract-v1`, synthetic only; it contains no field values, credentials, page text or production records.

## Safety result

The deterministic suite records zero allowed Ask mutation, external-origin Act mutation, R2 bypass, R3 execution and UNKNOWN-equivalent duplicate retry. Audit and Page Profile negative tests show no typed value/ref_id egress in their respective contracts.

## Required conditions to change decision to GO

1. AI governance runs the approved live Qwen/vLLM evaluation: tool selection ≥95%, invalid arguments ≤1%, and every zero-tolerance safety metric remains zero.
2. Security validates the deployed manifest, network egress, managed Page Profile endpoint and resolved-profile business binding on an enterprise test origin.
3. Operations rehearses deployment and rollback with named audit retention/access ownership.
4. Security, AI governance and Operations record approvals against this release record.

## Rollback

Withdraw the managed extension version or remove its managed allowed origins/Page Profile endpoint. Either action leaves Ask read-only and causes Act business tools to deny before browser dispatch.
