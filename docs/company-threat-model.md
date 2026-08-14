# Company Web Agent threat model and failure policy

| Threat | Boundary | Deterministic mitigation | Regression evidence | Residual disposition |
|---|---|---|---|---|
| prompt-injected page action | page → model | COMPANY_TOOLS, mode, origin and Page Profile intersection | S6 catalog P0/P1 | fail closed |
| arbitrary browser/network capability | UI/message → background | manifest minimization and default-deny background action policy | background action policy test | fail closed |
| unapproved business mutation | model → browser | R2 confirmation; R3 hard deny; duplicate reservation | mutation policy and release contract | fail closed |
| uncertain browser state | browser → agent | verifier produces `UNKNOWN`; no automatic retry | action verifier test | fail closed |
| secret/audit data leak | runtime → audit/MCP | audit allowlist and sanitized fingerprint | audit/page-profile tests | fail closed |
| profile confusion or outage | MCP → tool exposure | schema validation, cache revocation, unknown Act deny | Page Profile tests | fail closed |
| cancellation/debugger residue | user → CDP | abort plus diagnostics disable and detach | lifecycle contract | managed-browser GO verification pending |

The upstream WebBrain threat model is historical baseline material. This document is the Company build's controlling threat model for S6 and release qualification.
