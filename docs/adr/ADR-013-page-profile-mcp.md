# ADR-013: Resolve Page Profile deterministically before Act business tools

## Status

Accepted — 2026-08-15.

## Decision

Create an Accessibility Fingerprint with semantic roles/names only, remove field values and `ref_id`, and resolve it through the managed `https://mcp.company.net` endpoint. Cache only validated profile metadata. An unknown, invalid or unavailable profile denies Act business tools; only profile-listed COMPANY_TOOLS names can pass.

## Consequences

- A managed Page Profile service is a prerequisite for production Act workflows.
- Page metadata cannot expand origin, capability, risk or confirmation policy.
- The model cannot resolve profiles or substitute an authoritative business value when binding fails.
