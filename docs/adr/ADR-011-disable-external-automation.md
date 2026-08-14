# ADR-011: Disable external automation and network capability classes

## Status

Accepted — 2026-08-14.

## Decision

Do not expose arbitrary JavaScript, fetch/research networking, upload/download, scheduling, cloud runs, cloud sync, OAuth subscription providers, CAPTCHA automation, WebMCP or social-media automation. The Company registry denies these names before dispatch and the MV3 manifest removes their enabling permissions.

## Consequences

- Reintroducing any class requires an approved ADR, registry policy, manifest review and dedicated tests.
- Upstream source retained for provenance is not an authorization to activate it.
