# S26 migration baseline — 2026-10-19

Scope: Browser-local preservation and characterization only. The migration
architecture, construction design and runtime contracts were not changed.
Production implementation, manifest and package remain at 0.1.117.

Revision: `8eb08e116cb90c8182d0ac449e6cabace68488cb` on `master`, with existing
planning changes present at entry. [Exact initial paths and hashes](../baselines/s26/source-baseline.json)
record the dirty caveat. No S27 runtime was introduced, no external services were
contacted by the Chrome fixtures and no user-profile storage was read or written.

## Implementation and scenario evidence

| Card / scenario | Deliverable and observed result                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 / R01        | [Per-file disposition](../baselines/s26/disposition.json), frozen source/config/test/assets and pre-build artifact hashes; actual added source/config files must fail inventory validation; missing RF/Sprint/target and aliases fail closed.         |
| C2 / R02        | [Chrome presentation report](../baselines/s26/ui/report.json), paired stable DOM/focus/layout observations, screenshots, approval/value/consent/Stop states, Options sections, separate manager, workflow candidate/preview and dialogs.              |
| C3 / R03        | [Behavior corpus and first failures](../baselines/s26/behavior.json): existing no-op, stale target, partial/virtual collection, verified-action/goal distinction, routing, cancellation and provider errors. Full unit 993/993; fixture 1/1; E2E 1/1. |
| C4 / R04        | [Storage catalog](../baselines/s26/storage.json) with source digests, schema decisions and actual v1/v2/disabled/malformed decoder checks (3/3). No stored values or credentials exported.                                                            |
| C4 / R05        | [Consumer catalog](../baselines/s26/consumers.json) with static callers, native messages, registration gaps, platforms/artifacts, external routes and deletion checks. Unknown external compatibility remains explicit.                               |
| C5 / R06        | [Frozen qualification v1](../baselines/s26/qualification.json), exact metric denominators and first-attempt counting; negative tests reject fixture PASS for live JEV, MCP, OS install and release. No temporary executor/adapter introduced.         |

The versioned holdout contains 100 Ask and 100 Action task definitions covering
normal/virtual tables, charts, SPA, iframe/open-shadow, changed DOM, duplicate
controls, backend restart and provider failure. These are frozen specifications,
not executed independent release trials. S36 must supply actual fixture/live
observations, runtime/model versions, sample confidence and the live subset.

## Environment and exact commands

Linux, Node 20.19.6, pnpm 9.15.4, TypeScript 5.7.3, Vitest 3.2.4,
Chrome for Testing 147.0.7727.15. Chrome fixtures use an isolated profile, fixed
viewport/device scale and computed fonts recorded per capture. No real model
identity applies: primary/JEV responses come from local HTTPS fixtures.

Executed:

- `pnpm exec tsc -p tsconfig.build.json && node scripts/build-extension.mjs && node scripts/validate-package.mjs` — PASS, no version bump. [Built artifact hashes](../baselines/s26/built-artifacts.json); development diagnostics mode, not release qualification.
- `pnpm typecheck` — PASS.
- `pnpm check:module-boundaries` — PASS, 423 TypeScript files.
- `pnpm check:source-size` — existing baseline failure; [exact files/counts](../baselines/s26/source-size.json). No S26 source exceeds 199 lines. The design already assigns decomposition to later RF owners.
- `pnpm test:unit -- --reporter=json --outputFile=/tmp/s26-all-unit.json` — 202 files, 993 tests PASS. The double separator prevented JSON-reporter selection; console totals are the evidence, not an invented JSON artifact.
- `pnpm test:fixture && pnpm test:e2e` — 1/1 and 1/1 PASS.
- Focused `pnpm exec vitest run` for the suites listed in [behavior.json](../baselines/s26/behavior.json) with `--reporter=json --outputFile=/tmp/s26-behavior.json` — 98/98 PASS. Case names and source paths retained without raw data.
- `pnpm exec vitest run extension/tests/unit/migration/s26-storage-baseline.test.ts --reporter=json --outputFile=/tmp/s26-storage.json` — 3/3 PASS.
- `CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome node --experimental-websocket scripts/chrome-s26-smoke.mjs` — PASS; screenshots and structural comparisons in the presentation report.
- `node scripts/s26-inventory.mjs` and `node scripts/s26-inventory-negative.mjs` — inventory and physical unmapped-source/config rejection checks; see final verification below.
- `node --test scripts/s26-baseline.test.mjs` — ownership, scope, storage/consumer and frozen-corpus checks.
- `pnpm lint` — PASS after formatting the new capture helper.
- Same Chrome environment with `S25_REPORT=/tmp/s26-chrome-behavior.json node --experimental-websocket scripts/chrome-s25-smoke.mjs` — 8/8 controlled checks PASS: Ask tool-result continuation, typed decisions, Act dispatch/goal, provider 503 fallback, routing off and Settings.

S25 observed exactly one Save dispatch and goal verification, with its existing
controlled approval configuration. This does not measure approvals or dispatches
for the synthetic presentation stream: those captures issue **zero product action
dispatches and mint zero approval facts**. UI response stubs are fixture-only.

## First failure and recovery boundaries

[First failures](../baselines/s26/behavior.json) retain sandbox EPERM/network
startup failures, sender-policy denial, capture-driver timing/preload mistakes,
headless popup nonresponse, initial formatting and source-size failures. Original
production expectations were not rewritten. The original S5 helper was restored
byte-for-byte after the observer experiment; the S26 driver has its own controlled
message seam and deadline. New evidence does not close any existing issue.

Real model pairs, actual MCP clients, external Platform/PDP/Studio compatibility,
OS native registration and deployed packages remain UNVERIFIED. Native dev
installation is currently a placeholder and the current extension has no
nativeMessaging permission; the consumer catalog preserves that gap for S28/S37.

## Additional runtime characterization and terminal result

`CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome timeout 90s node --experimental-websocket scripts/chrome-s24-smoke.mjs`
passed. This executes existing popup-window identity/reuse, manager editor and
pagination, feature toggles and chat/command continuation assertions. It supplies
the window interaction baseline independently of the first stalled capture attempt.

The same environment with `timeout 90s node --experimental-websocket scripts/chrome-diagnostics-zip-smoke.mjs`
failed first in development mode because its checker assumes masked secrets.
`node scripts/build-extension.mjs --release && node scripts/validate-package.mjs`
passed without changing the version. Repeating the ZIP checker then failed on a
retained fixture origin in `execution-trace.json`; the synthetic secret itself
was masked. [Release artifact hashes and failure](../baselines/s26/release-diagnostics-baseline.json)
are preserved. No raw diagnostic file is committed. This remains a baseline
failure owned by RF27/S28/S31/S36, related to ISS-20261018-004; the issue was not
reopened or closed because S26 performs characterization, not an issue fix.
The exact assertion and production masking code remain unchanged.

The development artifact was restored afterward with
`node scripts/build-extension.mjs && node scripts/validate-package.mjs`.
Its hashes must match [the captured development build](../baselines/s26/built-artifacts.json).

Terminal result: S26 characterization delivered with known baseline failures
(source-size and legacy diagnostics ZIP origin assertion). These failures are
preserved for later RF owners; they are not successful release qualification.
S26 introduces no production runtime, schema migration or deployment. S27/S28
entry may use this frozen inventory; their own prerequisite/runtime gates remain.

## Final verification

`node scripts/s26-inventory.mjs` passed: **1,146 files, 30 RF owners**.
`node scripts/s26-inventory-negative.mjs` physically added unowned TypeScript and
config fixture files, observed rejection, then removed both fixtures.
`node --test scripts/s26-baseline.test.mjs` passed **6/6**; `pnpm lint` passed.
All 88 source-size failures match their initial source hashes. Frozen production
and architecture hashes have zero differences. Restored development artifact
hashes have zero differences from the UI capture build. No version bump occurred.
