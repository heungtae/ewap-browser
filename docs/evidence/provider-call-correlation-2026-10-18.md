# Provider call correlation verification — 2026-10-18

- Issue: [ISS-20261018-003](../issues/records/2026-10-18-provider-call-correlation.md).
- Source: `9d30fa88989b427acd6382b8e518d5f417f44ea2` plus uncommitted logging changes.
- Input: diagnostics for request `836d510a-b5be-4537-af81-73d91bfcbe41`, version 0.1.115.
- Initial scope: mocked responses and local compilation. Follow-up user runtime evidence is recorded below.

## Executed checks

```sh
node_modules/.bin/vitest run \
  extension/tests/unit/service-worker/provider-call-correlation.test.ts \
  extension/tests/unit/service-worker/act-harness-turns.test.ts \
  extension/tests/unit/act-provider-turn.test.ts \
  extension/tests/unit/providers/runtime.test.ts \
  extension/tests/unit/providers/transport.test.ts \
  extension/tests/unit/providers/s25-routing.test.ts \
  extension/tests/unit/providers/s25-gates.test.ts \
  extension/tests/unit/providers/s25-native.test.ts
pnpm build
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc -p tsconfig.build.json && node scripts/build-extension.mjs && node scripts/validate-package.mjs
```

All eight suites and 78 tests passed, including four new cases for action,
text-only and mixed projections, privacy, and unbound responses. Build compiled
TypeScript and generated `dist-extension/`, incrementing 0.1.115 to 0.1.116 in
the package, manifest and compatibility example.

After refining diagnostic labels, the same 78 tests and full TypeScript check
passed again. The final bundle was regenerated without another version bump;
package policy validation and ESLint on the changed source/test files passed.

The original `further_work` failure remains input evidence. This change does
not establish its detailed model rationale or change its application error
classification. Original ZIP, page content, prompts, URLs and credentials are
not copied into this record. At the time of those checks, user runtime
verification was pending.

## Follow-up runtime export

User-provided diagnostics for request
`d9de2891-02ce-4138-8c2d-7a8d193ecd16` reports extension 0.1.116.

| Call                                            | Observed sequence                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Read `428a8a11-c00a-42da-b8e8-32a442246b61`     | Requested → HTTP 200 → parsed two read tool calls → `read_results_appended_to_transcript`                                                    |
| Proposal `bd44edf4-2e7c-4aee-a4c5-31043c08cef8` | Requested → HTTP 200 → parsed `propose_set_checked` → same ID in `act.provider.response` → same ID in `review_blocked_further_work_required` |
| Reviewer `f0ed88f9-4af5-4701-82d2-db4f8796b03b` | Requested → HTTP 200 → parsed `submit_answer_review` → same ID with `verdict=further_work`                                                   |

Every listed event is bound to the exported request ID. The fixed
`reviewer_kind=primary_answer_review_fallback` label is visible. These
observations verify the logging correlation fix in the reported runtime.

All six Provider calls returned HTTP 200. JEV delegated result acceptance with
evidence sufficiency 0.25; the primary review returned `further_work`. The
application blocked execution and mapped that result to `PROVIDER_UNAVAILABLE`.
The detailed rationale is absent from the verdict-only schema. The request
did not demonstrate a completed page action or goal. Git revision, identical
site identity, wider live qualification and distribution remain unestablished.
