# ADR-005: Restrict the agent to Ask and Act modes

## Status

Accepted — 2026-08-14.

## Decision

Company tool exposure supports only Ask and Act. Dev mode returns no tools. Ask and Act initially expose the same audited read/control tools; form mutation tools remain disabled until S2/S3 policy and verifier gates are complete.

## Consequences

- Upstream Dev tools, provider tiers, WebMCP, skills and watch additions cannot reach the model.
- Ask is read-only by construction and Act does not gain mutation authority merely by mode selection.
