# Development diagnostic mode verification — 2026-10-18

Issue: [ISS-20261018-004](../issues/records/2026-10-18-development-diagnostics.md).
Source: base `9d30fa88989b427acd6382b8e518d5f417f44ea2` plus the current
uncommitted logging and diagnostic-mode changes. Fixtures use synthetic values;
no real credential, user prompt, target name or diagnostic ZIP is committed.

## Executed checks

```sh
node_modules/.bin/tsc --noEmit
node_modules/.bin/vitest run --silent=true extension/tests/unit
node_modules/.bin/vitest run --silent=true extension/tests/fixture extension/tests/e2e
node scripts/check-module-boundaries.mjs
node scripts/test-diagnostics-build-mode.mjs
pnpm build
node_modules/.bin/tsc -p tsconfig.build.json && node scripts/build-extension.mjs --release && node scripts/release-smoke.mjs
node scripts/build-extension.mjs --development && node scripts/validate-package.mjs
```

- Unit: 201 files / 990 tests passed. Includes development/release trace,
  content re-export, Provider records/configuration, complete worker export,
  ZIP mode labeling and existing release privacy regressions.
- Fixture/E2E: 2 files / 2 tests passed.
- TypeScript and affected-file ESLint passed. Module boundaries passed for
  423 TypeScript files.
- Compiled mode probes verify unmasked development, masked release and masked
  fallback without a build definition. A compiled release ignores a conflicting
  runtime global. Packaging guard cases pass.
- An actual development artifact was rejected by the release smoke with the
  expected masking-policy error. The actual masked release artifact passed.
- Build incremented 0.1.116 to 0.1.117 once. Both subsequent mode rebuilds kept
  that version. Final `dist-extension/build-info.json` reports
  `diagnostics_mode=development` and `diagnostics_masked=false`.

Initial new export tests failed because their fixture run IDs violated the
existing opaque-ID contract; valid synthetic IDs corrected the fixture. The
first module check found a type-only import cycle, removed by sharing the
mask-report type in a separate module. Subsequent checks passed.

## User runtime follow-up: development 0.1.117

Archive: `contextpilot-diagnostics-2026-10-18T06-35-48-adeb6dd2-d2b2-4096-97fd-6c05541bb358.zip`.
Request: `adeb6dd2-d2b2-4096-97fd-6c05541bb358`.
Archive SHA-256: `c047cdcc53bce14cdd4bb4d70ee8a4405719a09b209fabb16eea1c75fcee1e32`.
Analysis read the supplied archive locally; no new Provider request was sent.
The exact source revision of the installed extension is not established by the
version string alone.

- The manifest reports version `0.1.117`, `diagnostics_mode=development` and
  `diagnostics_masked=false`. Request text, actual target label, proposal
  arguments, JEV task/answers and primary review messages are retained as values.
  Provider configuration includes a nonempty raw credential and base URL. Page
  URL/title/referrer are present. These values are not copied into this record.
- All six recorded Provider HTTP calls returned 200. The action response proposes
  `propose_navigate`; its parsed response, Act response and final handling share
  call ID `2cd0be58-b123-4b28-abc3-4198b2a07134`.
- The JEV prepared-task review receives `tool=navigate`, an actual target label
  and `approval_status=not_granted`. It returns evidence sufficiency `0.45`,
  processor confidence `0.06` and an `accept` verdict with confidence `0.48`.
  The verdict is not adopted: the coordinator delegates to primary because
  sufficiency is below `0.9`.
- Primary review call `f0cc703a-a493-42a4-9fc1-6cf8025fe22e` receives two
  messages: prepared-action JSON and the original request embedded in an answer
  review instruction. It does not receive the page snapshot or previous read
  results. Its response is `submit_answer_review` with `verdict=further_work`.
- Local handling records `blocked_for_further_work` and
  `review_blocked_further_work_required`, with `automatic_execution=false`.
  The request terminates with `PROVIDER_UNAVAILABLE`. Current
  [prepared-task review](../../extension/src/service-worker/prepared-task-review.ts)
  reuses [answer review](../../extension/src/service-worker/primary-answer-review.ts)
  without its optional conversation thread. The
  [step runner](../../extension/src/service-worker/act-step-runner.ts) maps a
  rejected review to that Provider error before approval/dispatch. This is a
  separate application review/error-classification issue.
- The review contract requests only a verdict, so this response does not expose
  the model's reason. The captured input establishes the evidence and instruction
  mismatch; it does not establish the model's exact reason for choosing
  `further_work`.
- Raw Provider/JEV responses and the final review request have
  `masked=false,truncated=false`. Two larger Act request events report truncation
  at deep tool-schema fields. The worker reports 80,455 dropped records; captured
  values are unmasked, while depth/retention bounds still limit completeness.

R06 passes for this supplied runtime sample. Only documentation was updated for
this follow-up; the previously executed checks above were not rerun.

## Scope

Tests exercise synthetic captured values, archive generation and compiled
policy. The supplied user export adds runtime evidence for unmasked development
logging; its Act request fails during prepared-task review. It does not establish
successful action execution, user-installed release masking or public deployment.
Raw logging begins with new captured records; it cannot recover fields already
redacted by an earlier build. No public package was published.
