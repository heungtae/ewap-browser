# S36 installed six-unit checkpoint publication — 2026-10-27

**In Progress.** Parent `970837e601834a9383a5033888c5110ff344b3f1` plus this
uncommitted continuation; extension version 0.1.117. This extends authenticated
[resume observation](s36-resume-preflight-2026-10-25.md#authenticated-daemon-continuation--2026-10-27).
It does not qualify production activation or complete migration.

## Implemented scope

- [Strict RPC contracts](../../packages/shared/src/migration-rpc.ts) add
  `migration.checkpoints.publish/read`, gated by the optional daemon capability
  `migration.checkpoints`. Only six bounded integrity/count checkpoints and
  source digests cross this new endpoint. Raw source fields are rejected.
- The [browser adapter](../../apps/chrome-extension/src/migration/checkpoints-rpc.ts)
  validates the pinned manifest/profile, freeze, all six current source digests,
  five browser staging targets and explicit MG01 credential readback before
  publication and after its response. Readback also checks current targets and
  credentials. It does not retry a write after a failure or issue an owner ACK.
- The [backend service](../../apps/agent-server/src/migration/checkpoints-rpc.ts)
  binds profile/ID/epoch/revision to an existing prepared/copying journal, closed
  admission and legacy namespace. An atomic journal update checks the retained
  typed MG01 checkpoint and MG02 mirror, preserving any existing checkpoints.
  The first publication advances revision once and persists all six stores as
  `copying`; existing owner ACKs and terminal/validated journals reject publication.
  An exact duplicate at the original or resulting revision returns stored data
  without advancing revision. Stale/conflicting requests reject.
- The server checks retained MG01/MG02 metadata, not current browser stores or
  secret readiness. A raw metadata read is an observation. The browser adapter
  performs the actual source/target/credential readback; credentials lost at
  restart make that adapter reject until explicit reimport. A failed post-write
  check may leave a durable `copying` journal, never `validated` or an owner ACK.

## Verification

Linux; pnpm 9.15.4; Node 20.19.6 for TypeScript/Vitest/build and Node 22.23.2
for real SQLite/native/Chrome. Chrome 147.0.7727.15.

- S36 unit tests: **23 files / 122 tests PASS**, including eight new client/schema
  tests for current-source/target/secret/freeze checks, post-response races,
  strict six-unit metadata, response binding and idempotent readback.
- Full unit suite: **278 files / 1,375 tests PASS**. The first sandbox run passed
  1,372 tests; three existing S28 socket tests failed with `listen EPERM`. The same
  complete suite passes in the authorized socket-capable environment.
- Node 22 `--test scripts/s36/integration/*.test.mjs scripts/s36/transport/*.test.mjs scripts/s36/settings-transfer/*.test.mjs scripts/s36/secrets/daemon.test.mjs`:
  **38/38 PASS**. Three new tests cross actual native subprocess/IPC/SQLite for
  persistence, duplicate requests, daemon restart, lost credentials, stale scopes,
  each source mismatch, MG01/MG02 mismatch, expiration, conflicts, terminal phases
  and changed fences. Native MG03–MG06 test metadata uses placeholders; it is not
  the evidence for actual browser conversion.
- Actual Chrome `scripts/s36/settings-transfer/checkpoints-chrome.mjs`: **PASS**.
  Chrome local/session sources and actual IndexedDB feed all six checkpoints into
  the registered native host and installed packaged daemon. Duplicate publication
  retains revision 1; after daemon restart and explicit Session-only credential
  reimport, browser/SQL readback passes. The SQL journal is `copying`, six stores,
  revision 1, empty owner ACKs, namespace `legacy`, admission closed. CSP violations,
  model calls, business dispatches and approvals are zero.
  Qualification release ID:
  `1674253016b50e64150b93c6a8c9ea8de62d105abc55112ae16498734f40b3b8`.
  Local report: `dist/s36/checkpoints-chrome-20261027/report.json`, recording
  `sixUnitBackendCheckpointPublication:true` and
  `checkpointDuplicateAndRestartReadback:true`. The report's generic six-unit
  scope includes controlled preparation/freeze and candidate browser ACKs, not
  backend consensus or a global commit.
- Version-preserving S28, transport, secrets, release, install and integration
  builds pass. No product version increment or normal launcher change.
- TypeScript, ESLint/Prettier, module boundaries and cumulative
  `check:s36:settings-transfer` pass (1,909 inventoried files; 214 checked modules).
  New modules meet the 199-line limit; prior inventory mappings and frozen
  production/design hashes are preserved. `git diff --check` passes.

The first native test draft sent raw objects with a property order different
from schema normalization, so envelope integrity validation closed the channel.
The trusted client already normalizes commands; the native test now uses the same
domain parser. Initial failures are distinguished from the successful native and
Chrome runs above. No weakening of wire digest verification was made.

## Remaining acceptance

Installed source preparation/freeze/drain is still controlled. Current-source and
target readback must be repeated before independent validation, both-owner consensus
and commit. Global `validated`/ACK/commit composition, explicit session-source
recovery, real writer freeze/drain/restart ownership, UI parity, live JEV, holdouts,
OS-store/browser-process-restart qualification of this new endpoint, supported
deployment and compatible release delivery remain open. Original architecture,
Sprint designs, production routing, UI and version are preserved; S37 stays Planned.
