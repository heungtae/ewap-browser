# S6 residual risk register — 2026-08-15

| Risk | Severity | Status | Owner | Expiry / next action |
|---|---|---|---|---|
| unapproved mutation / R3 / UNKNOWN retry | high | closed locally by policy and contract tests | Extension Security | reopen on policy/tool change |
| secret audit leak | high | closed locally by allowlist redaction tests | Privacy | reopen on audit schema change |
| CDP detach leak | high | mitigated; local stop requests detach | Operations | verify on managed browser before production GO |
| Page Profile service unavailable | medium | fail closed | AI/MCP Operations | managed service qualification |
| live-model tool selection drift | high | release blocker, no risk acceptance | AI Governance | live evaluation before GO |

No high/critical risk is accepted for production. The two unresolved verification items make RC1 a NO-GO release candidate.
