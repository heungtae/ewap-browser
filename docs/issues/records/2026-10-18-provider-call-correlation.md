# ISS-20261018-003: Provider correlation lost after response projection

## Tracking

| Field             | Value                                                                           |
| ----------------- | ------------------------------------------------------------------------------- |
| Status / updated  | Resolved for logging correlation / 2026-10-18 KST                               |
| Affected scope    | Act harness response projections and diagnostic handling events                 |
| Reported version  | 0.1.115; bundle source revision unavailable                                     |
| Analysis baseline | `9d30fa88989b427acd6382b8e518d5f417f44ea2` plus uncommitted logging changes     |
| Related issues    | None with the same cause                                                        |
| Fix / artifact    | Uncommitted; local build 0.1.116                                                |
| Next verification | None for this logging scope; application review/error handling remains separate |

## Occurrence and cause

Request `836d510a-b5be-4537-af81-73d91bfcbe41` recorded six HTTP 200 Provider
calls. The primary model proposed `propose_set_checked`. JEV's result-acceptance
evidence sufficiency was 0.3, delegating review to the primary model. Final call
`93cc877c-285d-466f-b9e0-dbefcf997829` returned `submit_answer_review` with
`verdict=further_work`. Local handling recorded `blocked_for_further_work`,
then ended with `PROVIDER_UNAVAILABLE`.

The action proposal's `provider_call_id` was null and its handling logs were
missing. Diagnostics used a WeakMap keyed by the original Provider response,
but the harness and Act each created a new response projection. Fixed reviewer
labels under the diagnostic field `source` were also masked.

## Change and boundaries

Explicitly inherit diagnostic correlation at both projection boundaries and
record read results appended to the transcript and non-read responses forwarded to
Act. Fixed reviewer labels use `reviewer_kind`. Metadata remains outside the
enumerable response and tool transcript; source masking stays in place.

The separate mapping of `further_work` to `PROVIDER_UNAVAILABLE` is unchanged.
The review schema records only a verdict; the detailed model rationale cannot
be established from this bundle.

## Regression and acceptance

| ID  | Condition                                      | Result                                                                    |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| R01 | Read followed by an action proposal            | Final call ID survives both projections; PASS                             |
| R02 | Read followed by a text-only answer            | Correlation survives with no tool calls; PASS                             |
| R03 | Mixed read and proposal                        | Only the read executes; correlation survives; PASS                        |
| R04 | Unbound response and sensitive sentinel values | No invented ID or raw sensitive Provider event fields; PASS               |
| R05 | User-supplied 0.1.116 runtime export           | Matching request, response and handling IDs; reviewer label visible; PASS |

Tests: [provider-call-correlation.test.ts](../../../extension/tests/unit/service-worker/provider-call-correlation.test.ts).
Commands and limits: [verification evidence](../../evidence/provider-call-correlation-2026-10-18.md).

## History

- 2026-10-18: Diagnosed using the user bundle. Four new regression cases and
  74 related checks passed; build 0.1.116 produced. Original-site and installed
  runtime verification remain pending. The ZIP stays outside the repository.
- 2026-10-18: Follow-up runtime export
  `d9de2891-02ce-4138-8c2d-7a8d193ecd16` reports version 0.1.116. Read call
  `428a8a11-c00a-42da-b8e8-32a442246b61` links its request, parsed response
  and transcript handling. Proposal call `bd44edf4-2e7c-4aee-a4c5-31043c08cef8`
  links its request, response, Act projection and final blocked handling.
  Reviewer call `f0ed88f9-4af5-4701-82d2-db4f8796b03b` links its request,
  parsed response and `further_work` verdict; `reviewer_kind` is visible.
  R05 passes and this logging issue is resolved in that observed runtime scope.
  All six calls returned HTTP 200; application failure remains
  `PROVIDER_UNAVAILABLE` after the review rejected readiness. This is not
  action/goal completion or distribution verification. The bundle does not
  establish its Git revision or the identity of the site independently.
