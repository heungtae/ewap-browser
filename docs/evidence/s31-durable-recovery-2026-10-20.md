# S31 durable task and dispatch recovery — 2026-10-20

**In Progress. Target storage/runtime implementation and controlled checks delivered;
S30 prerequisite acceptance and installed product recovery remain incomplete.**

Base revision: `5ee4c7062860184b024524e2cdd80087718cbabc`, dirty tree containing
pre-existing uncommitted S29/S30 work. Linux; Node 20.19.6 for TypeScript/Vitest/
Chrome runners, Node 22.23.2 for built-in SQLite, pnpm 9.15.4, TypeScript 5.7.3,
Vitest 3.2.4, fake-indexeddb 6.2.4, Chrome 147.0.7727.15. Built-in `node:sqlite`
requires Node 22.13+ and emits its experimental warning on the checked version.
No provider, model, MCP, external business service or deployed release was tested.

## Implementation and scope

- [TaskStore](../../apps/agent-server/src/tasks/store.ts): SQLite WAL/FULL
  transactions admit unique request IDs, commit ordered events and materialized
  revisions together, enforce owner and revision checks, acquire profile/tab
  leases, and rotate runtime epochs on reclaim. Duplicate admission returns the
  original task; a changed admission rejects. Lease reclaim preserves budgets and
  suspends previously leased tasks. It does not restore old targets or approvals.
- [Reducer/budget/history](../../packages/task-engine/src/durable/index.ts):
  explicit allowed transitions, terminal closure, monotonic active/attempt budgets,
  overall deadline checks and revision-based replay. Verified action and incomplete
  goal remain separate; the first failure survives subsequent failures. Completion
  is unavailable until a trusted S33 goal acceptance path exists. Stored records
  contain task metadata/digests, not prompts, raw page content or action values.
- [Durable intents](../../apps/agent-server/src/tasks/intents.ts): validate the
  prepared digest and current owner/mode/profile/tab/lease/epoch/generation before
  committing an intent. Dispatch ID and task/step uniqueness prevent an alternate
  command ID from reopening the same logical step. Fresh intent admission charges
  a persisted attempt; duplicates do not reset or recharge it. Missing receipts
  reconcile as uncertain, with `replayAllowed:false`.
- [Receipt synchronization](../../apps/chrome-extension/src/runtime/durable-dispatch.ts):
  commit the existing S30 browser ledger before acknowledging the backend receipt.
  Backend ACK loss leaves the browser receipt available for reconciliation. There
  is no additional executor. The injected intent and receipt ports can compose
  with ToolRuntime, but the production bridge is not switched to those ports.
- [Browser revocation](../../packages/browser-runtime/src/revocation.ts): Stop
  blocks that runtime synchronously before persistence/network work; persist the
  revocation in IndexedDB, restore it before dispatch availability, and expose
  pending cancellation until acknowledged. ACK never removes the block. The
  guarded browser port checks again immediately before every side effect.
- [Retention](../../apps/agent-server/src/tasks/retention.ts): prune settled
  receipts and historical event detail only after terminal age reaches 30 days
  and the original deadline has passed. Preserve unresolved attempts and minimal
  admission/final-state tombstones so pruning cannot re-admit old requests.
  No raw task content is admitted by this implementation. Storage growth and
  tombstone compaction still need long-running qualification.
- [SQLite factory](../../scripts/s31/open-store.mjs): explicit target factory
  opens a private owner directory/file; call `openTaskStore(directory)` after
  building. This factory is not an installed daemon entrypoint or Windows ACL
  qualification. Schema is target-only; no existing user database is migrated.

## Executed checks

- `pnpm typecheck` and `pnpm lint`: PASS. Separate strict TypeScript check of the
  server task entrypoint also passed (the normal packages config omits app code).
- `node scripts/s31/build.mjs`: PASS, isolated browser engine/runtime and Node task
  bundles, plus a separately named controlled test fixture bundle. No production
  build or version increment occurred.
- `node node_modules/vitest/vitest.mjs run extension/tests/unit/migration/s27 extension/tests/unit/migration/s28 extension/tests/unit/migration/s29 extension/tests/unit/migration/s30 extension/tests/unit/migration/s31`:
  **132/132 PASS**, before adding two reducer/budget tests. Final targeted S31 run:
  **5/5 PASS**, including those two additions. These counts overlap by three.
- `/home/heungtae/.npm/_npx/5dad66f2cb301fc2/node_modules/node/bin/node scripts/s31/sqlite.test.mjs`:
  **8/8 PASS**. Real SQLite file/two independent connections, lost ACK/admission
  conflict, tab/revision fencing, injected event-insert rollback, lease recovery,
  cancellation, active/wait/overall expiry, retention, reordered history, unknown
  receipts, composed ToolRuntime intent-before-effect and receipt ACK loss. A
  separate backend process exited with status 9 after admission commit, before
  ACK; the reopened database returned one original admission/event.
- `CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome node --experimental-websocket scripts/s31/chrome.mjs`:
  **5/5 PASS, 2 DOM input dispatches, 0 provider calls**. Before-reservation normal
  execution, reserved-without-receipt uncertainty, receipt ACK loss, stale document
  rejection and offline Stop. Actual DOM and IndexedDB close/reopen were used.
  [Report](s31-chrome-2026-10-20/report.json),
  [environment](s31-chrome-2026-10-20/environment.json),
  [capture](s31-chrome-2026-10-20/recovery.png).
- Module-boundary check, S31 source-size/preserved-source/successor inventory check,
  formatting and `git diff --check`: see the accompanying verification manifest.

For SQLite checks use Node 22.13+ after `pnpm build:s31`; the root development
Node 20 cannot import `node:sqlite`. `pnpm test:s31:sqlite` runs that same script
when the shell's Node supports SQLite. `pnpm test:s31` runs the browser/reducer
unit checks, and `pnpm test:chrome-s31` requires `CHROME_FOR_TESTING_BIN`.

## First failures and remaining acceptance

The first typecheck rejected a static fake-indexeddb ESM import and fixture ports
inferred too narrowly for wrappers. Dynamic import and widening the local test
reference to RuntimePorts corrected these test integration errors. Adding the
step uniqueness column initially exposed an incomplete injected SQL test row;
its missing step ID was added and all SQLite checks rerun. Sandbox TCP/Unix socket
restrictions blocked Chrome/S28 checks; permitted reruns passed. pnpm registry
identity verification also failed under restricted networking; permitted normal
pnpm typecheck/lint reruns passed. None of these failures established a product
runtime regression. Original S27 feasibility failure and S28–S30 limits remain.

C1/R01 has real local SQLite atomicity and process-exit coverage; simultaneous
cross-process JEV/MCP writers and their authenticated owner admission are not
qualified. C2/R02 has real composed runtime/SQLite/fake-IDB and Chrome-IDB coverage,
not actual CDP partial-input process-kill coverage. C3/R03 checks epoch rotation,
stale document rejection and receipt recovery; real MV3 Worker kill/backend
pairing, route/profile/tab mismatch and pending-prompt recovery remain. C4/R04–R05
checks local Stop, durable backend cancel, deadlines and terminal cleanup; offline
reconnect synchronization through the real bridge, concurrent browser contexts,
automatic expiry scheduling and long-running resource limits remain. C5/R06 has
pure history projection; preserved product UI/reconnect/export integration and
first-failure evidence correlation across processes remain.

The initial target state machine intentionally exposes only the lifecycle needed
for these checks. Full task phases, trusted pending prompt reconstruction,
reconciliation-before-resume and accepted goal results are not claimed complete.
The target ports do not authorize external callers; authenticated bridge admission
must bind owners and IDs before exposing them. S30 acceptance and all S31 runtime
scenarios must close before marking S31 Completed. S32 remains Planned.

The production extension, original architecture/Sprint plans and version 0.1.117
are preserved. No commit, push, installation or release was performed. Rollback
must fence target tasks and retain browser/backend journals: code rollback cannot
authorize replay of uncertain dispatches.
