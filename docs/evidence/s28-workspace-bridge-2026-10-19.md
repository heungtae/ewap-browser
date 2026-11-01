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

## Transfer continuation — 2026-10-31

Source base `4a7b67eee099ab03bdc1a02a4668b796769ac835` plus this change. `pnpm test:s28` passed 37 tests on Linux/Node 20.19.6, including a real authenticated Unix socket transfer whose ACK arrives after expiration and closes the connection. Connection-level tests also check stalled timeout, late ACK/completion rejection, ID retirement, cancellation of partial data, and a separately completed digest-verified transfer. `pnpm build:s28`, `pnpm check:s28`, and `pnpm typecheck` passed; the isolated build preserved version 0.1.117. There were no provider calls, browser dispatches or approval facts. Browser/Worker reconnection, producer stalls across processes and the other S28 acceptance gaps remain unqualified; S28 remains In Progress.

The subsequent [ISS-20261031-001](../issues/records/2026-10-31-bridge-replay-snapshot.md) fix preserves the cursor and waits for a snapshot after resync, validates replay before rendering, and clears availability while a request is pending or fails. The S36 presentation recovery unit suite passed 7 tests as a related regression. Actual snapshot application and Worker/Panel reconnect are still open.

At source `6adf3d55e`, an isolated clean worktree built S28 and ran `pnpm test:chrome-s28` and `pnpm test:chrome-s28:native` using Chrome for Testing 147.0.7727.15 and Node 20.19.6. Both passed: the [native report](s28-chrome-2026-10-31.json) records isolated registration, authenticated handshake and restart/reconnect, with `taskReady: false`. It covers three target pages, settings focus and a fixture message, not snapshot application, full UI parity or product routing. Offline frozen installation first failed because one package was absent from the local store; online frozen installation succeeded without changing the lockfile. The pre-existing dated evidence was not overwritten.

## Live extension document boundary — 2026-10-31

Source base `c66391b77` plus this continuation. The target Worker now checks the browser-supplied sender ID, URL and document ID against exactly one live Chrome context of the allowed type with a valid window before forwarding existing bridge requests. Missing, stale, duplicated, wrong-page or wrong-context senders fail closed. This is a point-in-time document check; it does not mint approval, bind a task owner, establish authorization after navigation, or enable a task command.

The later actual side-panel test found that Chrome provides neither sender document ID nor a nonnegative context window ID for that context. The restricted connection-bootstrap fallback and its limits are recorded under [ISS-20261031-006](../issues/records/2026-10-31-sidepanel-context-window.md); the initial rule above describes the earlier source only.

`pnpm test:s28` passed 45 tests, including context negative tests; the isolated build, S28 boundary and type checks passed. A separate worktree with the same uncommitted source changes ran `pnpm test:chrome-s28:native` on Linux/Chrome for Testing 147.0.7727.15: [report](s28-ui-context-2026-10-31.json) records actual native handshake/reconnect and `taskReady: false`. That positive test uses an extension page opened as a tab, not a Chrome side-panel window, and does not establish stale-context rejection in actual Chrome, UI ownership for tasks, or production routing. Provider calls, approvals and business dispatches were zero.

At source base `5073ee3e0` plus the Chrome harness continuation, a second [actual Chrome report](s28-ui-context-negative-2026-10-31.json) records a legitimate panel-tab request succeeding while the daemon is online and a separate extension document with an unapproved URL being denied. The script now accepts `S28_EVIDENCE_DIR` to avoid overwriting prior evidence. S28 checks and script formatting passed. An explicit ESLint invocation on these `.mjs` files reported existing Node globals as undefined; the repository's ESLint command does not include `scripts/`, and Prettier is the configured script check. This tests a foreign URL, not a stale same-URL document or the actual side-panel context; task ownership and approvals remain outside scope.

At source base `e1204ee50` plus the harness continuation, [Chrome report](s28-ui-context-pages-2026-10-31.json) also records that the allowed Settings page with `#agent` and profile manager page can request bridge capabilities while the daemon is online. These are extension tabs in an isolated profile; actual side-panel context and task ownership remain unverified.


## Worker-issued panel ownership — 2026-11-01

Source base `8f718d7e5` plus this change. [ISS-20261031-006](../issues/records/2026-10-31-sidepanel-context-window.md) records a per-tab random panel address issued by the target Worker's Chrome action listener, live sender/context/tab checks, bounded storage and revocation. Target-only packaging adds a toolbar action; production manifest and version remain unchanged. The [controlled Chrome report](s28-panel-owner-2026-11-01.json) verifies the resolver with real sender and context data, plus rejection after revocation. The fixture injects issuance; it does not qualify actual toolbar event delivery or task admission. No approval, provider call or business dispatch occurred. S28 remains In Progress pending full UI parity, task snapshot recovery and the remaining acceptance matrix above.

Verification: `pnpm typecheck`, `pnpm test:s28` (49/49), ESLint for changed TypeScript, `pnpm build:s28`, `pnpm check:s28`, `pnpm check:s29` and `git diff --check` passed. Chrome invocation used `S28_EVIDENCE_DIR=/tmp/s28-owned-panel-20261101c` and the pinned local Chrome for Testing binary with `pnpm test:chrome-s28:native`. First failures and correction limits are retained in the issue record.


## Actual toolbar activation — 2026-11-01

Source base `cdebf6ca6` plus changes. The [actual toolbar Chrome report](s28-toolbar-2026-11-01.json) uses the browser's extension action command through its debugging pipe, without injected owner issuance. It qualifies the production target action listener, panel address issuance, `setOptions`/`open`, native bootstrap and copied-address tab denial on Chrome 147/Linux. Awaiting configuration first lost the user gesture; invoking `open` synchronously in the action callback fixes this. [ISS-20261031-006](../issues/records/2026-10-31-sidepanel-context-window.md) retains first failures and navigation-test limits. S28 unit tests pass 50/50 and typecheck/build pass; full S28 completion is still not established.


## Connection stream snapshots — 2026-11-01

Source base `068570503` plus this change. The server's explicitly connection-only replay stream has a random process/stream identity and a versioned `wca.connection-snapshot/v1` marker. The stream accepts only `browser.connected`/`browser.waiting` events. An initial request, retention gap, changed stream or cursor beyond a restarted stream receives an authoritative connection cursor snapshot, not a task snapshot. Subsequent requests carry the stream identity. Generic replay retains its original invalid-cursor behavior.

Target presentation explicitly opts into connection-only recovery. It advances only after validating an empty snapshot batch, matching stream identities and matching snapshot/cursor revision. Any task-bearing event disables this opt-in for the document lifetime, including remounts. Generic task clients and legacy waiting markers remain blocked until their actual task snapshot is applied. This does not restore task history, grants, handles or approval state and does not make `taskReady` true.

The [Chrome 147/Linux report](s28-connection-snapshot-2026-11-01.json) verifies real daemon stop/restart, changed stream identity, visible disconnected/connected status, connection snapshot recovery and unchanged message count, alongside actual toolbar/bootstrap negatives. Unit regressions cover retention, a zero-cursor daemon restart, post-reset events, generic/task isolation and malformed snapshot revision. The first inherited IPC/native tests expected ordinary replay on an initial request; expectations were updated for the explicit initial snapshot handshake. S28 remains In Progress: task snapshots, full 26-state UI parity/management and other installation acceptance are still open.

Verification for the final snapshot change: `pnpm test:s28` 54/54, S36 presentation recovery 7/7, `pnpm typecheck`, changed TypeScript ESLint, S28/S29/S30 boundary and schema golden checks, the version-preserving S28 build, actual Chrome native smoke and `git diff --check` pass. No provider call, approval or business dispatch was performed.

The broad unit run (`pnpm exec vitest run extension/tests/unit --reporter=json --outputFile=/tmp/s28-snapshot-unit-20261101.json`) passed 1432/1432 tests on this final source; this includes S29 regressions but is not transport or product qualification for S29.
