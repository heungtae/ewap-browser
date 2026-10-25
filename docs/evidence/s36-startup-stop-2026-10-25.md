# S36 graceful daemon startup cancellation — 2026-10-25

Parent `3d7fc70a193bba6830dfe47b8afeba7c7d54ed2b` plus this dirty slice.
Version 0.1.117; S36 In Progress, S37 Planned.

[ISS-20261025-002](../issues/records/2026-10-25-daemon-startup-stop.md) records
late signal registration during daemon initialization. The retained
[pre-fix TAP](s36-startup-stop-artifacts-2026-10-25/before-fix.tap) fails both
SIGTERM/SIGINT cases: the parent exits while the gated helper is outstanding.

The explicit packaged daemon now observes signals before asynchronous startup,
checks cancellation after pairing/probe awaits and uses one shutdown path. It
retains installation exclusion while an existing bounded helper operation runs,
then suppresses further startup and releases only owned locks. A real startup
failure retains exit 1 rather than being relabeled successful cancellation.
Already-listening shutdown still closes clients, SQLite and locks in order.

## Executed checks

- `pnpm build:s36:secrets` (including fixture-import exclusion).
- Node 22.23.2 startup-stop/coordination/daemon/release/install/transport/settings
  Node tests: [42/42](s36-startup-stop-artifacts-2026-10-25/native-tests.tap).
- Three new actual subprocess cases: repeated SIGTERM/repeated SIGINT during a
  successful gated probe and SIGTERM during a failing gated probe. Locks remain
  held until the gate finishes; no SQLite/socket is created; repair/unregister
  succeed afterward. The helper gates are synthetic and not secret operations.
- Private GNOME Keyring 50.0 persistence/lock/MG01/native restart regression:
  [7/7 report](s36-startup-stop-os-2026-10-25/report.json),
  [TAP](s36-startup-stop-os-2026-10-25/tests.tap).
- `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`.
- `pnpm check:s36:settings-transfer`: cumulative preserved inventory, source size,
  browser/backend boundaries and original production/design hashes.
- `git diff --check`.

[Actual captured build](s36-startup-stop-artifacts-2026-10-25/report.json) and
[manifest](s36-startup-stop-artifacts-2026-10-25/release-set.json): 37 files,
3,601,068 bytes; release ID
`5274a0ff77a9b75b42a565f04f2f2ba68b31c7ba8a57a456e153c6eee5e5dc6b`.
That set was integrity-verified, not registered/delivered. Runtime tests use actual
built daemon files in separately pinned synthetic release fixtures/private installs.

The initial cumulative check still selected the previous manifest and rejected
the new inventory as unmapped. Its manifest selection and immediate-parent
inheritance assertion were updated before the passing check. No mapping in the
previous inventory was changed.

## Remaining limits

The helper process is not interrupted by this change; its existing five-second
operation bound applies, and the daemon retains ownership until it settles. A stop
during socket binding closes the resulting server; this is not a claim that no
transient listener can ever exist at that boundary. SIGKILL/crash/power loss can
still leave locks/socket and require investigation/manual recovery. No stale lock
reclaim, automatic service manager, full source-writer freeze, six-owner installed
coordination, UI parity, live JEV or holdout qualification is implied. Normal
startup/default Session-only mode, production admission, UI and original designs
are preserved. No Chrome/live-provider/normal-user deployment run was repeated.
