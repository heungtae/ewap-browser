# S4 audit data, access and retention contract

## Allowed schema

`timestamp`, `tool`, `mode`, origin only, `risk`, `outcome`, `success`, `dispatched`, and `policy` only. `redactAuditEvent()` reconstructs this allowlist and discards every other property.

## Forbidden data

Passwords, OTP/MFA, API tokens, cookies, authorization headers, full typed values, arguments, raw page content, AX `ref_id`, coordinates and exception payloads are not retained.

## Retention and access decision

The initial approved boundary is a bounded local extension timeline (`companyAuditEvents`, maximum 1000 events). It has no export, forwarding or analytics path. Access is limited to the extension's current profile; organization-wide retention/access requires a separate approved ADR and is not implied by this local record.

## Correlation

Policy denial, confirmation denial, profile denial and verifier-normalized outcomes share the same permitted event vocabulary. Audit is supporting evidence only; a browser verifier remains the success authority.
