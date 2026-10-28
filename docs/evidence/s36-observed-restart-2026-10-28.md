# S36 fresh observed-owner rebind — 2026-10-28

**In Progress.** Parent `4dd50e85c73b5093d0ad12c5b8b8a720f69c29ed` plus this
uncommitted continuation; extension version 0.1.117. This extends the
[observed owner](s36-observed-owner-2026-10-28.md) and the earlier
[browser-restart evidence](s36-browser-restart-chrome-2026-10-25.md).

## Implemented scope

- [The read-only backend snapshot](../../apps/agent-server/src/migration/resume-snapshot.ts)
  binds an existing `copying`/`validated` legacy-namespace journal to its profile,
  migration ID, epoch, revision and manifest/store digest under one SQLite
  transaction. It requires closed admission and a live, unexpired request context.
  Its strict response contains scope, phase and digest only; no historical ACKs,
  source values, credentials or execution grants. It does not write the journal.
  The bridge requires the distinct `migration.resumeSnapshot` capability;
  an older peer advertising only `migration.resume` is rejected before dispatch.
- [The fresh browser rebind](../../apps/chrome-extension/src/migration/resume-observed.ts)
  arms a new local/session observed owner after the caller establishes freeze/drain
  and explicit current pairing. It checks backend status/snapshot binding, all six
  current source digests, all staging targets and MG01 credential readback twice,
  with repeated backend scope/digest and source checks around those reads. It never
  calls the browser owner's ACK/verify-ACK methods or returns historical ACKs.
  Rejection disposes both new listeners; success returns an explicitly disposable
  observation handle. The result is not a grant or authorization to commit.
- The browser validates retained target checkpoints and current credentials; the
  backend digest binds those values to its actual current journal. Stale profile,
  epoch, revision, phase, manifest/store digest, changed source, missing target,
  lost credential or delivered storage change fails closed. Previously persisted
  browser/backend ACK metadata is not interpreted as fresh readiness.

## Controlled Chrome restart

Linux; Node 22.23.2; Chrome 147.0.7727.15; explicitly pinned qualification artifact
`3869ccea3888a33049cbbc815dc7b59fec8e3a1e1c2d761d553928cd29b9754d`.
Both Session-only and private GNOME OS-store runs use a new Chrome process/PID with
the same isolated profile while the daemon remains running. Before restart the
fixture publishes six checkpoints and validates them; backend ACKs remain empty.
After restart, local storage and IndexedDB remain, while session sources and pairing
are gone. The existing negative check observes the old browser ACK and rejects it;
fresh pairing is explicit. The **new rebind helper** is then called with ACK methods
replaced by fatal test stubs: missing session sources reject specifically as
`MIGRATION_CHECKPOINT_READBACK` without invoking either method.

The fixture explicitly supplies deterministic synthetic session data and waits for
its storage event before constructing a new observer. Fresh readback then succeeds
without calling historical ACK methods. This is a controlled positive test, **not**
automatic recovery of user data, executable approvals or prior page authority.
Final SQLite readback remains `validated`, revision 2, six stores, no backend ACKs,
namespace `legacy`, admission closed. No provider calls, business dispatches,
approvals, global commit or CSP violations occurred. Local reports:

- `dist/s36/observed-restart-session-capability/report.json`
- `dist/s36/observed-restart-os-capability/report.json`

The first positive fixture attempt regenerated random synthetic chat IDs and
correctly failed MG04 source/target readback; stable fixture-only IDs fixed this
test input. Two final-path OS-store attempts reached fresh rebind but their separate
subsequent credential read returned `RPC_UNAVAILABLE`. A later isolated run again
completed rebind, retained that first read failure, and passed one explicit
read-only retry; the final capability run again records
`firstCredentialReadbackFailure: RPC_UNAVAILABLE` and succeeds on one read-only
retry. A separate concurrent run received `RPC_UNAVAILABLE` before the expected
lost-source classification, and is not counted as a successful negative test.
The cause of the OS-store disconnect is not established, and uninterrupted
OS-store recovery is unverified. No mutation was retried.

An added race regression initially exposed a returned observation after a watched
source changed during the last backend snapshot. The final source/freeze guard now
rejects that case before returning, and both listeners are released.

Verification: **283 files / 1,399 unit tests** and **55 native integration/
transport/settings/daemon tests** pass. The earlier unmodified Chrome restart
regression also passed using the earlier qualification artifact. TypeScript,
ESLint/Prettier, module boundaries and `git diff --check` pass. The cumulative
inventory check passes with **1,942 files / 239 checked modules**, including the
199-line limit, prior mappings and preserved product/design hashes.

## Remaining acceptance

Writer freeze/drain and source reimport are controlled fixture inputs; there is no
normal-user recovery UI, automatic restoration, installed startup composition or
cross-context writer lock. Event observation remains asynchronous and is not a
writer freeze. This does not perform fresh owner ACK agreement, namespace switch,
global commit, supported delivery or full live/UI/holdout qualification. Session
loss without matching current input remains blocked; no historical approvals or
page bindings are restored. S36 stays In Progress and S37 Planned.
