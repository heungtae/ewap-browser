# S36 explicit packaged migration daemon — 2026-10-25

Parent revision: `8c538fb1417cd585321cadb85e1f8a7688d95990` plus this dirty slice.
S36 remains In Progress and S37 Planned. Extension version remains 0.1.117.

## Scope and behavior

The optional Linux-secret package now includes an independent migration daemon
bundled from runtime modules. Its build asserts that no test fixtures or transport
qualification helpers enter the dependency graph. The normal S28 daemon/production
entrypoints remain unchanged. Historical helper/adapter-only packages retain their
existing validation behavior; the new capture flag requires all three built files.

An operator must supply an independently pinned release ID, an absolute private
pairing path and exactly one explicit store mode. The daemon verifies its own
containing release before opening credentials, SQLite or its socket. OS mode loads
only its packaged helper and fails closed on unavailable/locked OS setup. Session
mode is explicit and volatile. No automatic selection, fallback or OS unlock is
introduced. The existing authenticated MG01/MG02/status interface is unchanged;
there are no remote prepare/fence/commit/activation commands.

Canonical private directory, pairing permissions, exact colocated socket path,
private SQLite checks and a process-lifetime exclusive lock bind startup ownership.
An existing socket is never unlinked at startup. Rejected startup leaves an existing
owner lock/socket intact. Graceful stop removes only the acquired lock after server
and database shutdown. Crash-stale lock/socket recovery remains manual; this is not
a managed service or a proof that all legacy/target writers have been frozen.

## Evidence

[Actual artifact report](s36-packaged-daemon-artifacts-2026-10-25/report.json)
and [manifest](s36-packaged-daemon-artifacts-2026-10-25/release-set.json):
37 files, 3,599,945 bytes; release ID
`39f4d8e1da85e80b6224e0f200c7f1d8a4b2702e40f5896a946b6a931125d1fb`.
The actual captured artifact set was integrity-verified, not delivered or registered.

[Native TAP](s36-packaged-daemon-artifacts-2026-10-25/native-tests.tap): 36/36
release/install/transport/settings-transfer/daemon checks under Node 22.23.2.
The new tests reject invalid pin/mode/extra arguments, changed helper, permissive
pairing file, preexisting lock/socket and unavailable OS bus before creating SQLite.
A real authenticated native subprocess reaches the packaged Session-only daemon;
restart loses volatile credentials and fails validation with admission still closed.

[OS report](s36-packaged-daemon-os-2026-10-25/report.json) and
[TAP](s36-packaged-daemon-os-2026-10-25/tests.tap): 7/7 on private D-Bus/GNOME
Keyring 50.0. The new case uses actual built daemon/helper files in a separately
pinned synthetic release fixture, controlled prepared journal and source guard,
then exercises real authenticated native MG01 stage, daemon restart, persistent
readback and locked-keyring rejection. It does not use the user's desktop keyring.
The synthetic fixture differs from the actual captured artifact set above.

Executed builds: `pnpm build:s36:release`, `pnpm build:s36:secrets`,
`pnpm build:s36:transport`, `pnpm build:s36:install`. The secrets build was rerun
with its new fixture-import exclusion assertion before artifact capture.

Static checks: `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`,
`pnpm check:s36:settings-transfer` (cumulative inventory/module size, browser/backend
boundaries and preserved production/design hashes), `git diff --check`.

## Remaining acceptance

Normal startup still uses Session-only. Managed normal-user service deployment,
released-version compatibility, crash ownership recovery, OS selection/retention
operations, Windows/macOS, actual source/target writer freeze/drain, installed
all-six orchestration, full UI parity, JEV and holdouts remain open. No Chrome or
live-provider run was repeated for this runtime packaging slice. No business task,
approval or production cutover was performed. See [remaining gates](../s36-remaining.md).
