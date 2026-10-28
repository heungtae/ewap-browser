# S36 Chrome storage source-change observation — 2026-10-28

**In Progress.** Parent `079dfebc9f3c38bbe1647161aa96422433197679` plus this
uncommitted continuation; extension version 0.1.117. The existing
[validation and owner agreement](s36-consensus-2026-10-27.md) retains its stated
controlled-freeze limits.

The opt-in [source watcher](../../apps/chrome-extension/src/migration/source-watch.ts)
wraps a caller-provided frozen source with a local/session storage change listener,
an explicit key set and epoch. A watched change invalidates the observation until
disposal even if the original value returns. Other storage areas/keys are ignored;
unwatched reads, mismatched epochs, upstream fence revocation and disposed handles
fail closed. It checks the underlying fence and listener state around reads without
storing or logging change values. The caller owns listener disposal.

The source watcher **does not block writes**, provide a cross-process lock, observe
changes before its listener is installed, or survive Worker/browser restart.
Chrome event delivery is asynchronous; this is an additional detection signal,
not an atomic snapshot or proof of writer freeze. It is not wired into the
production entrypoint or the installed migration coordinator. Current source and
target digest/readback checks and explicit current ownership remain required.

Verification on Linux, Node 20.19.6 and Chrome 147.0.7727.15:

- Focused unit tests: 12/12 pass, including actual consensus preflight rejection
  before dispatch after a watched change, and separate changed/restored, scope,
  epoch, upstream revocation, disposal and in-flight read cases.
- The complete S36 unit selection passes 25 files / 134 tests. TypeScript,
  ESLint/Prettier, module boundaries, `git diff --check`, and the cumulative
  `check:s36:settings-transfer` pass (1,927 inventoried files / 228 checked
  modules; prior mappings and frozen product/design hashes retained).
- Isolated Chrome `scripts/s36/settings-transfer/consensus-chrome.mjs` passes
  using the previously pinned qualification daemon release
  `d85cf252b62b4c7362593cfc91e46e80c46b96eb45d2a66c45db0c0a64850db5`.
  After the installed controlled consensus flow, a real `chrome.storage.local`
  write to fixture provider settings triggers the listener. Restoring the exact
  original value does not revive the watcher. The fixture restores the source
  inside its isolated temporary profile and returns no settings or secret values.
  Zero CSP violations, provider calls, business dispatches and approvals are
  reported; backend remains `validated`, namespace `legacy`, admission closed,
  with no global commit. The final local report is
  `dist/s36/source-watch-chrome-20261028-final/report.json` and records
  `sourceChangeObservationVerified:true`.

This is a bounded observer continuation. Integration into actual owner startup,
coverage of every legacy writer, real writer blocking/drain, process-restart
recovery, installed commit, OS/UI/live/holdout and release gates remain open.
S36 stays In Progress and S37 Planned.
