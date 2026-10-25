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
