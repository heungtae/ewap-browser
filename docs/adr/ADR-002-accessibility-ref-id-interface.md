# ADR-002: Use accessibility tree and stable ref_id as the primary interface

## Status

Accepted — 2026-08-14.

## Context

Browser automation must avoid model-generated CSS/XPath/coordinates whenever semantic targeting is available. WebBrain already supplies an accessibility-tree representation and stable ref resolution.

## Decision

Expose semantic AX role/name/ref_id targeting as the primary company interaction interface. CSS/XPath remains a narrow, diagnostic fallback only; it cannot replace deterministic origin, risk, confirmation or verifier controls.

## Consequences

- S3 verifier and fixture coverage is tied to ref freshness and target identity.
- Page Profile fingerprints use sanitized AX semantics, not raw DOM or values.
- Tool contracts report stale/ambiguous targets explicitly and do not guess a replacement.
