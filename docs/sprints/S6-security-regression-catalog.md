# S6 security regression catalog

| Priority | Attack or failure path | Test/fixture | Expected deterministic result |
|---|---|---|---|
| P0 | external-origin mutation | `enterprise-lockdown.test.mjs` | Act mutation denied before dispatch |
| P0 | R2 bypass / R3 destructive request / retry | `mutation-policy.test.mjs`, contract evaluation | confirmation required; R3 and duplicate denied |
| P0 | forbidden background capability | `background-action-policy.test.mjs` | default deny before hydration |
| P0 | sensitive audit input | `audit-recorder.test.mjs` | value/page/credential fields absent |
| P1 | hidden or overlay target | `test/fixtures/occlusion.html` | target mismatch/occlusion refusal |
| P1 | stale reference / SPA transition | fixture runner stale-ref cases | pre-dispatch failure, never success |
| P1 | malformed form target | fixture runner input/checkbox cases | explicit failure, no synthetic fallback |
| P1 | Page Profile outage or invalid response | `page-profile.test.mjs` | unknown/invalid profile fails closed |
| P1 | debugger Stop lifecycle | `lifecycle-contract.test.mjs` | abort plus diagnostics disable and debugger detach requested |

This catalog is intentionally synthetic/local: production-origin and managed-service cases remain release NO-GO requirements.
