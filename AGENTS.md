# AGENTS.md — Company Web Agent

## Mission

Build a secure enterprise browser agent based on WebBrain. Preserve its accessibility-tree/ref_id browser interaction architecture while drastically reducing provider, tool, permission and network surface.

## Baseline

- Upstream: webbrain-one/webbrain
- Commit: ec76e498ee38a827d6bafc4838cc44f40ea08cd9
- Target: Chrome Manifest V3
- LLM: Qwen3.5 served through company vLLM/OpenAI-compatible endpoint

## Non-negotiable Architecture

- Accessibility Tree + stable ref_id is the primary UI targeting interface.
- The LLM proposes actions; deterministic code authorizes actions.
- Do not put enterprise authorization decisions in prompts.
- Only tools in COMPANY_TOOLS may be exposed to the model.
- Browser mutations require verification.
- Mutation outcome UNKNOWN must never be automatically retried.
- Ask mode is read-only.
- Act mode is permitted only on enterprise allowlisted origins.
- R2 business mutations require confirmation.
- R3 destructive actions are denied.

## Security

Do not add or re-enable the following without an approved ADR:

- arbitrary execute_js
- arbitrary fetch/research network tools
- downloads
- uploads
- schedulers
- cloud providers
- cloud sync
- OAuth subscription providers
- CAPTCHA automation
- WebMCP
- social-media automation

Never log:

- passwords
- OTP/MFA values
- API tokens
- cookies
- Authorization headers
- full typed values
- raw page text

## Implementation Rules

When adding a browser tool, update all of:

1. tool schema
2. COMPANY_TOOLS registry
3. mode allowance
4. capability classification
5. risk classification
6. confirmation behavior
7. verifier
8. audit redaction
9. unit tests
10. browser E2E tests

Prefer semantic ref_id targeting over CSS/XPath. CSS/XPath is fallback only.

Do not perform broad rewrites of `agent.js` or `background.js` during the lockdown phases. Extract code incrementally after behavior is covered by tests.

## Test Gates

Before a PR is complete:

- build passes
- lint passes
- unit tests pass
- Chrome extension fixture/E2E tests pass
- model-exposed tool snapshot is reviewed
- Manifest permission snapshot is reviewed
- no security regression is introduced

## Page Profile MCP Rules

- Resolve the active Page Profile before exposing page-specific business tools.
- Page Profile resolution must be deterministic and must not require the LLM.
- Generate a semantic Accessibility Fingerprint; do not send raw field values, secrets, ref_ids, coordinates or full raw DOM.
- Only MCP tools explicitly allowlisted by the resolved Page Profile may be exposed to the model.
- When the Page Profile changes, revoke tools from the previous profile immediately.
- Unknown profile must fail closed for Act mode.
- Authoritative field sources declared in Page Profile metadata must use deterministic MCP binding before agentic discovery.
- If an authoritative Business MCP call fails, never let the model guess the value.
- Page Profile metadata never bypasses enterprise domain/capability/risk policy.
