# S32 advanced collectors — 2026-10-20

**In Progress. Target collectors and isolated tool invocation are implemented.
S29–S31 prerequisites, full product wiring and remaining acceptance are open.**

Base revision: `7c50bf6fb`, dirty S32 implementation. Linux; Node 20.19.6,
pnpm 9.15.4, TypeScript 5.7.3, Vitest 3.2.4, Zod 4.6.7, fake-indexeddb 6.2.4,
Chrome 147.0.7727.15. Production source, original architecture/Sprint plans and
version 0.1.117 are preserved. The final unpacked artifact is a **release-mode,
version-preserving build**, with diagnostics masking enabled. No release was
published and no live model, JEV, MCP or external business system was called.

## Delivered target paths

- [Bounded CDP broker](../../packages/browser-runtime/src/cdp/broker.ts) exposes
  typed AX, network, screenshot and focused text operations, with separate grants,
  current context/lease/deadline checks, one active session per tab and owned
  cleanup. Arbitrary expressions, request replay and post-body inspection have no
  broker operation. Input remains Act-only and requires the caller's shared
  runtime authorization callback; advanced read tools do not expose it.
- [Chrome transport](../../packages/browser-runtime/src/cdp/chrome-transport.ts)
  adapts the promise-based debugger API and allowlists five commands. Native
  definitive attach rejection differs from uncertain acknowledgement. Unknown
  attach, timeout or cleanup failure preserves quarantine. The
  [IndexedDB marker](../../packages/browser-runtime/src/cdp/ownership.ts) fences
  other contexts and survives reopen. A recovered marker blocks availability;
  no unqualified automatic detach or recovery is attempted.
- [Shared collector budget](../../packages/collector/src/advanced/budget.ts)
  enforces 64 units, two simultaneous reads, 16 deep targets, eight page scopes,
  16 MiB accumulated sanitized data and two screenshots per task composition.
  Each unit is clipped to ten seconds and the parent deadline. The elapsed clock
  is checked after resolution as well as by a timer, so a blocked event loop
  cannot accept a late result. DOM cell walking is separately bounded and checks
  its shared unit deadline. Nested read/hash work remains in the unit budget.
- [Frame survey](../../packages/collector/src/advanced/frames.ts) shares a 5,000-node
  walker across permitted DOM documents/open shadows, at most eight frames and
  four frame edges. Denied/inaccessible/excess frames and unobservable closed
  roots produce gaps. [Navigation tracking](../../packages/collector/src/advanced/routes.ts)
  rotates document/route epochs and invalidates old bindings; unrelated events
  cannot replace the admitted tab/frame identity. These are explicit target ports,
  not production navigation registration.
- [Inert registered data](../../packages/collector/src/advanced/main-reader.ts)
  accepts bounded JSON and exact registered paths. It never walks live MAIN
  objects, proxies, getters or arbitrary functions. Static endpoint hints remain
  unobserved/non-executable and withhold the original endpoint text. Live MAIN
  interception or arbitrary framework readers are not supported by this path.
- [Network observation](../../packages/browser-runtime/src/cdp/network-window.ts)
  collects at most 100 Fetch/XHR response records inside an owned, bounded window.
  It omits request bodies/headers/cookies, filters response origin, and exposes
  bodies only for observed, finished bounded JSON responses after fresh consent.
  [Normalization](../../packages/collector/src/advanced/network.ts) hashes URL
  paths/request IDs, drops query strings, and projects only reviewed response
  fields. Missing/oversized/compressed-over-limit responses remain unavailable.
  Window truncation is explicit; observation never authorizes replay.
- [Window accumulator](../../packages/collector/src/advanced/windows.ts) keeps
  immutable source context, stable source keys, positions and source/filter/total
  consistency. Equal text is not identity. Missing keys, recycled values, gaps,
  missing EOF, changing filters/totals or limits prevent complete coverage.
  Windows cap at 200 rows, 50 windows and 10,000 rows; the 8 MiB envelope reserves
  space for metadata. [Movement coordination](../../packages/collector/src/advanced/window-driver.ts)
  is read-only in Ask; its optional Act movement ports require authorization and
  verified scroll receipts. Unknown movement never retries or blindly restores.
  Restoration failure remains partial. Actual scroll execution is not registered
  by S32; production movement/receipt correlation remains an acceptance gate.
- [Static DOM tables](../../packages/collector/src/advanced/dom-table.ts) use
  bounded text walking, private ancestry checks and reviewed static/key contracts.
  Arbitrary discovered tables cannot assert a complete business dataset. Viewport
  requests stay viewport-only. [Charts](../../packages/collector/src/advanced/chart.ts)
  prefer accessible/registered source data; visual output is always inferred and
  non-executable. [Transient visual capture](../../packages/collector/src/advanced/visual.ts)
  requires current consent and masking; rejected buffers are cleared/disposed.
  No positive live-model visual interpretation was qualified.
- [Advanced tool composition](../../apps/chrome-extension/src/collectors/advanced-tools.ts)
  registers table/chart/observed-API tools only when actual read ports exist.
  Targets are pinned to task/profile-partition/tab/frame/document/route/generation
  scope. Ask gets these read tools without mutation authority. Results carry
  strict `wca.collector/v1` provenance, coverage, TTL and digest; verification binds
  the original input, call ID, current target and returned digest. Data is clipped
  to a 256 KiB tool response with explicit partial coverage, while the task budget
  charges all collected bytes. No production provider schema/executor route was
  switched. S33/S34-owned tools remain unavailable.

## Executed verification

- `pnpm typecheck`; `pnpm lint`: PASS.
- `pnpm test:unit`: **1,157/1,157 across 236 files PASS**, including **30 S32 tests**. Counts and source hashes are recorded in the
  [verification manifest](../baselines/s32/verification.json). The targeted S32
  suite covers CDP ownership, permission, quarantine, detach and uncertain attach;
  response consent/origin/caps; MAIN getter rejection; AX name withholding;
  identity/EOF/changed-filter coverage; Ask movement denial and restoration;
  unit timeout including delayed timers; source immutability and exact tool-result
  verification/egress caps.
- `node scripts/s32/build.mjs`: isolated collector/browser broker/tool bundles PASS.
  `node node_modules/vitest/vitest.mjs run extension/tests/fixture extension/tests/e2e`:
  fixture 1/1 and E2E 1/1 PASS.
- No-version production build: `node node_modules/typescript/bin/tsc -p tsconfig.build.json`,
  `node scripts/build-extension.mjs`, `node scripts/validate-package.mjs` PASS.
  For privacy-sensitive existing Chrome checks, rebuilt with
  `node scripts/build-extension.mjs --release` and validated again. This does not
  bump the extension version. Final artifacts remain release mode.
- `CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome node --experimental-websocket scripts/s32/chrome.mjs`:
  **9 controlled outcomes PASS**, three installed read tools, six invocations
  (five completed reads, one denied source read), zero business mutation dispatches
  and zero provider calls. Real DOM table/JSON, private-descendant rejection,
  same-origin frame/open shadow, cross-origin/closed-root gaps and SPA invalidation
  ran in Chrome. Owned remote CDP returned seven AX role rows, one sanitized
  observed JSON response and one consented screenshot rejected before inference
  because masking was unavailable. **Three attachments/three detachments**, one
  screenshot disposal, zero interpreted source images and zero persisted source
  screenshot files. A separate capture of the final text-only fixture summary is
  retained as evidence. [Report](s32-chrome-2026-10-20/report.json),
  [environment](s32-chrome-2026-10-20/environment.json),
  [summary capture](s32-chrome-2026-10-20/recovery.png).
- S19 controlled production-extension Chrome: **21/21 PASS** after release-mode
  rebuild. Command: `S19_LIVE_MODEL= CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome node --experimental-websocket scripts/chrome-s19-component-tools-smoke.mjs`.
  Initial development-mode run passed 13 and failed eight ZIP masking assertions;
  changing the build mode fixed that verification mismatch without source edits.
- Module boundaries, source-size, frozen production/design checks and successor
  inventory: [manifest](../baselines/s32/verification.json). Install used cached
  workspace dependencies; the final frozen-lockfile check is recorded there.

## Preserved failures and limits

[First failures](s32-first-failures-2026-10-20.json) retain compile/fixture recovery
and existing regression failures. The original S13 smoke failed at
`Act did not complete through the controlled provider`; a separate unchanged-source
rerun with metadata-only diagnostics again had one Ask analysis request and no
Act analysis request. The precise cause is unresolved; no successful full S13
qualification is claimed.

`S13_CHECK_ONLY=1` on the masked release artifact passed API source selection,
independent R0 permission and Ask reinjection, then failed the diagnostics ZIP
fixture-origin assertion in `execution-trace.json`. This matches the existing
[S26 recorded release diagnostics baseline](../baselines/s26/release-diagnostics-baseline.json).
The remaining lifecycle/coverage/restart submatrix was not reached. The restricted
submatrix does not replace the failed original Ask/Act smoke. Original production
sources and regression runners were not modified to make these checks pass.

| Card / checks | Current evidence                                                                                                                | Remaining acceptance                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 / R01      | Owned remote CDP AX/network/capture, simulated denial/conflict/unknown ACK/cleanup failure, real IndexedDB fencing              | Installed Chrome debugger permission/conflict, transport shutdown and persisted-marker reconciliation across real MV3 restarts; composed focused-input qualification                                                                |
| C2 / R02      | Real same-origin DOM frame/open shadow and explicit cross-origin/closed gaps; SPA binding rejection                             | Authenticated browser frame/document identities, permitted cross-origin isolated readers, real frame navigation and automatic incremental graph refresh                                                                             |
| C3 / R03      | Inert registered JSON, static non-executable hints, sanitized real observed Fetch response, exact consent and privacy negatives | Production MAIN/source adapter registration, authenticated consent UI/bridge and wider reviewed network adapters                                                                                                                    |
| C4 / R04–R05  | Identity/EOF/caps unit matrix, real static/viewport table and registered chart, actual unmaskable screenshot rejection          | Real virtual/paginated recycling and scroll restoration through shared runtime with fresh task/step receipt correlation; accessible-chart adapters, positive masked visual interpretation and durable cross-restart task accounting |
| C5 / R06      | Shared registry schema/execute/same-call verification for three real read ports in controlled Chrome; S19 21/21                 | Full product entrypoints/provider continuation, progress UI/journal, repository/immutable-dataset integration, S13 failures and all prerequisites                                                                                   |

The per-task budget/consent/broker objects are target compositions. Backend S31
budget recovery and actual browser sender authentication are not wired here;
recreating these objects is not qualified to reset or resume a production task.
AX intentionally withholds names and all control values: roles are useful evidence,
but this is not a qualified full named AX data reader. Static table completeness is
relative to its reviewed source contract, never inferred from arbitrary visible
rows, page hints or screenshots. Tool-level unavailable channels do not grant
fallback execution authority.

S32 remains **In Progress**; S33 is Planned. Rollback unregisters advanced tools,
cancels active read units, stops owned observers and preserves CDP quarantine and
all existing dispatch journals. No commit, push, migration, install or release was
performed in this task.
