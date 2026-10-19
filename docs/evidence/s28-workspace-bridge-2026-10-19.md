# S28 workspace and bridge implementation — 2026-10-19

Status: **In Progress. S28 completion is not established.**

## Revision and preservation

Base HEAD: `020cbbf6a` (`master`). Verification used a dirty tree containing the
previous, uncommitted S27 implementation and this S28 work. No commit or release
was made. Extension identity/version remains `0.1.117`. The original architecture
and Sprint documents were not edited. The existing `extension/` production
entrypoints remain selected by normal packaging; target artifacts are isolated in
`dist/s28/`. This follows the S28 rollback gate rather than switching ownership
merely because IPC succeeds. The successor disposition preserves all S27 entries.

## Implemented paths

- C1: target Chrome/Node workspace apps, copied presentation templates/assets,
  Vite HTML/TypeScript browser build, esbuild native launcher, and isolated built
  package exports for shared/browser and Node-only decision/provider packages.
  Generated exports are under `dist/s28/packages`; source exports remain available
  to TypeScript consumers. No implicit release/version increment occurs.
- C2: DOM view factory and injected TaskClient/SettingsClient controller; same
  static tags, IDs, classes, CSS and assets; existing settings hash navigation and
  focus behavior. Target-only wording identifies GPT Analyst and required JEV;
  legacy primary continuation is disabled and projected to safe stop. Fixture
  TaskClient results render as existing assistant messages. All form submissions
  are intercepted while target admission/management capabilities are unavailable.
- C3: bounded 256-KiB little-endian framed UTF-8/JSON; closed Zod protocol;
  per-installation/profile pairing and extension allowlist; expiring, single-use
  HMAC challenge; private Unix directory/socket and protected config validation.
  No TCP/network listener. Unauthenticated/incompatible traffic fails before
  command state access. Backend imports no Chrome code.
- C4: connection ID/epoch, message ID, digest, deadline and replay checks;
  correlated replies; bounded replay/cursor with explicit snapshot marker;
  disconnect clears browser availability; chunk byte/count/digest/order/ACK/
  cancellation/deadline limits, four outstanding chunks and one active transfer.
  Retired transfer IDs cannot reopen within a connection. Completed transfers
  alone grant no task or browser authority.
- C5: Linux install/repair preparation and dry run, native launcher, readiness
  states, secret-store port with explicit session-only implementation. Blank
  writes retain only an exactly matching validated provider identity, endpoint,
  provider kind and credential boundary. Public
  settings expose no credential values. The installer preserves pairing on repair
  and refuses identity changes, unsafe files and an unexpected executable.

The backend intentionally advertises `taskReady: false`. S29–S33 task/browser
operations are not implemented by this bridge; no second executor was added.
S27 live JEV feasibility remains failed and S33 remains gated.

## Executed verification

Environment: Linux; Node `20.19.6`, pnpm `9.15.4`, TypeScript `5.7.3`,
Vitest `3.2.4`, Vite `6.4.1`, Zod `4.6.7`;
controlled Chromium reports `Chrome/147.0.7727.15`.

- `pnpm typecheck`: PASS after resolving the initial browser API declaration and
  optional-field typing errors.
- `pnpm lint`: PASS, including the new apps/packages.
- `pnpm exec vitest run extension/tests/unit --reporter=json --outputFile=/tmp/s28-final-unit.json`:
  1,083/1,083 PASS in the broad run; affected 35 S28 tests were rerun after
  shutdown/secret-identity hardening. See the machine verification record.
- `pnpm test:s28`: 35/35 at initial local review; final counts in machine record.
  Includes real private Unix socket integration and browser adapter → real native
  subprocess → authenticated daemon, plus unauthenticated command rejection.
- `pnpm build:s28`: PASS. Vite reports two upstream Zod comment-annotation warnings;
  no browser Node import or build failure. No version changed.
- `pnpm check:s28`: boundaries, frozen production/design hashes, copied HTML
  structure/styles/assets, installer dry run/repair/permissions/identity checks.
- `node scripts/s28/export-contracts.mjs`: eight schema goldens.
- `pnpm check:module-boundaries`: legacy 423-module graph PASS; separate S28 build
  graph checks cover target browser/backend imports and the 199-line limit.
- `pnpm exec tsc -p tsconfig.build.json`, `node scripts/build-extension.mjs`,
  `node scripts/validate-package.mjs`: existing development artifact build/package
  validation PASS without a version increment.
- `CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome pnpm test:chrome-s28`:
  target panel/settings/profile pages, missing-backend status, static IDs, settings
  hash/focus and fixture TaskClient message PASS. Screenshots and counters are in
  [S28 UI evidence](s28-ui-2026-10-19/report.json).
  A further run of the same script with `--native` registered the host inside a
  disposable Chrome profile: real Chrome Native Messaging → host → authenticated
  daemon PASS; daemon stop reports unavailable, clean restart reconnects and
  resumes cursor 0 with no duplicate events. User registration was not modified.
- `node --test scripts/s28/runtime.test.mjs`: built public Node package exports
  load without extension globals, PASS.
- `pnpm install --frozen-lockfile`, `pnpm test:fixture`, `pnpm test:e2e`: PASS
  (one fixture and one E2E check).

First failures: frozen install initially rejected newly added workspace manifests;
`pnpm install --no-frozen-lockfile` regenerated the lock. Browser API/optional field
TypeScript errors were corrected. The first Chrome script selected an unrelated
Worker and failed PAGE_READY; restricting discovery to `/js/service-worker.js`
resolved it. Temporary Chrome profile cleanup needed retry handling for child-file
release. These failed attempts are not counted as successful checks.

Approval facts minted: **0**. Browser dispatches: **0**. Model/provider calls: **0**.
Screenshots contain controlled presentation fixtures, not live website/private data.

## Remaining acceptance work — do not mark complete

| Scenario | Verified scope | Remaining acceptance |
| --- | --- | --- |
| R01 | Isolated builds, CSP/path checks, no backend Chrome imports or UI authority imports, assets and version preservation | Target MAIN-world helper runtime behavior and full emitted-browser dependency qualification |
| R02 | Static structure/styles, three target pages, settings focus, TaskClient fixture message | Full 26-state S26 replay: approval/value/source dialogs, profile edit/history/delete, provider/workflow management and window ownership; complete target management clients/controllers |
| R03 | Private Unix socket/config ownership, challenge/version/context negatives, real native subprocess and isolated real Chrome registration | End-user per-profile provisioning UX and the complete wrong-origin registration matrix; other OS ACLs unqualified |
| R04 | Closed frames and chunk/order/ACK/deadline/integrity/cancellation limits | Full large-transfer IPC negatives under connection loss and producer stalls |
| R05 | Cursor replay/snapshot marker, response correlation, event deduplication and disconnect clearing | Full Worker/Panel-loss Chrome matrix and authoritative snapshot application; daemon/native stop/restart is verified, no task durability claim |
| R06 | Installer preparation/dry run/repair negatives, readiness and session-only provider secrets | User-facing pairing and registration/startup/repair/stop/uninstall qualification; no OS credential-store implementation |

Windows/macOS and release/store/live-provider qualification were not performed.
S26's previously recorded source-size and diagnostics ZIP failures are unchanged;
this delivery does not resolve them. The target app must not replace normal
production packaging until these S28 acceptance gaps close.

Native registration/reference: [Chrome Native Messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
was checked for per-user registration, allowed origins and launch/framing behavior.
The application intentionally applies the stricter S28 256-KiB frame limit.
