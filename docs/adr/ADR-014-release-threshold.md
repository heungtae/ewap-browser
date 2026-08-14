# ADR-014: Separate deterministic qualification from live-model release approval

## Status

Accepted — 2026-08-15.

## Decision

Use a versioned synthetic deterministic contract suite for code-level release qualification. A production go decision additionally requires an approved live Qwen/vLLM evaluation with tool-selection accuracy at least 95%, invalid arguments at most 1%, and zero safety violations (unconfirmed R2, R3 execution, secret leak, UNKNOWN retry).

## Consequences

- Passing local qualification does not authorize production deployment.
- Any model, serving, prompt/template or tool-schema change reruns the live evaluation.
- Missing managed endpoint, Page Profile service or required human approvals produces `NO-GO`, not risk acceptance.
