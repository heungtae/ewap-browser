# Provider inventory — S0 baseline

## Observed source

`src/chrome/src/providers/provider-catalog.js` and the provider directory expose multiple cloud, local, OAuth, router and vision providers. The manifest also permits broad `connect-src` egress. This is not acceptable for Company Web Agent.

## Company target

| Configuration | Required behavior |
|---|---|
| Provider type | one OpenAI-compatible company vLLM path |
| Model | managed Qwen3.5 identifier |
| Endpoint | managed configuration only; no user-editable URL |
| Credentials | managed storage/enterprise policy; never audit/log/provider export |
| Vision | disabled in initial release |
| Egress | only company provider, Page Profile MCP, allowlisted Business MCP and approved audit endpoint |

S1 must delete or make unreachable third-party provider, OAuth, subscription, cloud and local-provider selection paths. S8 re-verifies endpoint and model version in the release evidence bundle.
