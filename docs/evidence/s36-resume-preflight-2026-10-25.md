# S36 source-bound resume preflight — 2026-10-25

Parent `e5b926d2a4ae1ddc80d49c10014250fa94732990` plus uncommitted actual-browser
restart qualification and this backend-session fix. Version 0.1.117; S36 In Progress,
S37 Planned.

[ISS-20261025-003](../issues/records/2026-10-25-migration-resume-source.md) tracks a
reproduced early-resume gap. Existing session prepare returned the saved validated
journal after source loss; later commit/readback guards were still present. The
[pre-fix TAP](s36-resume-preflight-native-2026-10-25/before-fix.tap) fails with a missing
expected rejection. Retained TAP normalizes trailing whitespace only.

For prepared/copying/validated journals, `MigrationSession.prepare` now reads all
six source digests through the existing frozen composition port, compares them to
the original manifest, rechecks the fence and detects a revision/epoch race. It
rejects without rewriting the journal or erasing old checkpoints/ACKs. A terminal
journal is still observed with existing semantics rather than reinterpreted as an
incomplete migration. The change is in the backend migration-session composition;
the standalone installed RPC daemon does not compose this session yet.

## Executed checks

- `pnpm build:s36:integration`: updated controlled runtime composition bundle.
- Node 22.23.2 `--test scripts/s36/integration/*.test.mjs`:
  [19/19](s36-resume-preflight-native-2026-10-25/tests.tap), including 11 new resume
  cases and eight existing integration flows/faults. Actual SQLite; fake IndexedDB
  and controlled source/freeze ports. The resumed source-loss/drift rejection cases
  preserve checkpoint, ACK, revision and fence; separate concurrent-state cases
  retain externally advanced state and make no additional resume write.
- `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`.
- `pnpm check:s36:settings-transfer`: complete cumulative inventory with unchanged
  immediate-parent mappings, module sizes, import boundaries and original frozen
  production/design hashes.
- `git diff --check`.

The already-uncommitted real-browser restart evidence is preserved
[separately](s36-browser-restart-chrome-2026-10-25.md); its three Chrome scenarios
and S36 unit 110/110 precede this session-only change. Chrome was not rerun for the
backend-session preflight. The earlier independently pinned installed artifact
remains unchanged and does not claim to contain this local session-orchestration
fix; the daemon does not import the session class. No new package/version delivery.

## Remaining limits

Source preflight is not staged-target validation or role/task readiness. Loss of
Session-only credentials, target expiry and mirror damage remain subject to the
existing copy/ack/commit readback checks. The caller must supply real writer freeze
and ownership; source observations are not an atomic snapshot without those ports.
Installed global checkpoint publication/consensus/commit, explicit lost-session
source recovery, managed normal-user service, UI parity, cross-version/crash recovery,
live JEV and holdouts remain open. No silent source rehydration, historical approval
reuse, dispatch/admission or production cutover was added. Original architecture,
individual Sprint designs, UI templates and production entrypoints are preserved.

## Authenticated daemon continuation — 2026-10-27

Parent `cb304d81df72ee591e82b2a2abaf8eb64688684f` plus this uncommitted
continuation; version 0.1.117. The original session-only evidence above remains
historical. The installed optional daemon now exposes a separate read-only
`migration.resume.check` operation, advertised as `migration.resume` and validated
at both privileged endpoints. It does not compose `MigrationSession` or enable
remote prepare/copy/ACK/commit.

The browser adapter takes fresh observations from the supplied browser owner
before and after the request, checking freeze and all-six digest stability. The
daemon binds profile/ID/epoch/revision and requires prepared/copying/validated,
legacy namespace and closed admission in a SQLite transaction. The result contains
only scope, phase and `sourceMatched`; no source values or executable authority.
The native regression rejects drift in each of MG01–MG06, stale ID/epoch/revision,
invalid authentication, expired/aborted/missing contexts and unavailable capability.
Successful checks and failures preserve journal, checkpoints, ACKs and fence.

Executed on Linux with pnpm 9.15.4, Node 20.19.6 for TS/unit/build and Node
22.23.2 for native SQLite/Chrome; Chrome 147.0.7727.15:

- `pnpm test:unit`: 277 files / 1,367 tests pass, including S36 114 tests.
- Node 22 `--test scripts/s36/transport/*.test.mjs scripts/s36/settings-transfer/*.test.mjs scripts/s36/secrets/daemon.test.mjs`:
  16/16 pass after the final transaction change, including packaged Session-only
  daemon restart and read-only source matching/drift rejection.
- Version-preserving S28, transport, secrets, release and installation builds pass.
- TypeScript checks, ESLint/Prettier, module boundaries, cumulative
  `check:s36:settings-transfer` (1,902 files; 209 checked modules), frozen
  production/design hashes and `git diff --check` pass.
- Actual `scripts/s36/settings-transfer/owner-chrome.mjs` passes using the final
  pinned qualification artifact set
  `6a971960267bb7b8325459f144044d7db467429153ef360937c3d09bf9f130b2`.
  The report at `dist/s36/resume-rpc-chrome-20261027-final/report.json` records
  `sourceBoundResumeCheckVerified:true`, six-unit browser readback, installed
  startup, MG01/MG02 persistence, browser ACK reopen and zero CSP violations.
  The actual browser owner re-observes Chrome local/session sources and IndexedDB
  around Worker → registered native host → packaged daemon requests after daemon
  restart. The prepared backend journal and freeze remain controlled fixtures.

Initial sandbox native runs could not create Unix sockets (`EPERM`); permitted
reruns pass. Local artifact capture/one direct inventory invocation also hit child
Git `EPERM`; permitted execution is required in this environment. The historical
`check:s36:transport` inventory predates the daemon launcher and reports that
existing file as unmapped; the cumulative `check:s36:settings-transfer` is the
current inventory check. An interrupted pnpm launcher was replaced by equivalent
local installed CLI/build commands without changing dependencies.

No OS-store, browser-process restart, live JEV, holdout, public release or full UI
qualification is added by this continuation. The result remains an observation;
actual source-writer freeze, session-source recovery and global installed
coordination/commit are still pending. S36 remains In Progress and S37 Planned.
