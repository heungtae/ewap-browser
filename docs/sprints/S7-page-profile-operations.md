# S7 Page Profile operations and change control

## Publish and rollback

Profiles are version `1` documents published only by the managed MCP service. A release owner must validate origin, tool subset and authoritative-field metadata before publish. Rollback removes or replaces the profile; clients fail closed when the version/schema is invalid.

## RBAC and separation

Profile publishers may describe page identity and business tool metadata only. They cannot change browser origin allowlists, COMPANY_TOOLS capability/risk, confirmation rules or audit retention. Those changes require their own ADR and code review.

## Cache and revocation

The cache key combines origin and sanitized semantic hash. Navigation/SPA transition calls `revokeCompanyPageProfile`; direct mutation dispatch resolves again immediately. Any outage or invalid response leaves profile state unknown and removes mutation schemas from Act exposure.

## Authoritative fields

Only profile-declared fields can use the deterministic managed MCP binding contract. Binding failure returns an explicit failure code; there is no model fallback or value guess.
