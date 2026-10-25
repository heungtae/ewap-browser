# S36 installation/daemon lifecycle exclusion — 2026-10-25

Parent revision: `6b3ae29dd3635b99cbea87a61a2b934c600a183b` plus this dirty slice.
Extension version remains 0.1.117. S36 In Progress; S37 Planned.

## Reproduction and behavior

[ISS-20261025-001](../issues/records/2026-10-25-install-daemon-coordination.md)
tracks a verified lifecycle gap: the explicit migration daemon acquired a private
migration lock before an awaited OS probe, but installers only checked their own
lock and the not-yet-created socket. The [before-fix TAP](s36-install-coordination-artifacts-2026-10-25/before-fix.tap)
records the expected-exception failure against the parent build.

The daemon now acquires the shared `install.lock` before reading pairing/awaiting
the OS probe, retaining it through server/database shutdown. Install, repair,
unregister and forward/reverse release switching use that same exclusive lock.
The existing migration lock remains for compatibility. Installers additionally
reject a historical migration lock even if no socket exists. Failed startup does
not remove another owner's lock/socket. Neither lock has a stale timeout/reclaim.

## Executed checks

- `pnpm build:s36:secrets`, `pnpm build:s36:install`, `pnpm build:s36:release`.
- Node 22.23.2 native daemon/coordination/release/install/transport/settings-transfer
  checks: [39/39](s36-install-coordination-artifacts-2026-10-25/native-tests.tap).
- Paused synthetic OS probe in an actual packaged process: no socket yet; repair,
  unregister and transition reject, leaving the installation receipt unchanged.
- Existing installer lock rejects daemon startup before SQLite/socket creation.
- Actual listening Session-only process: repair/unregister reject; graceful SIGTERM
  removes locks/socket; repair/unregister then succeed with unchanged pairing.
- Historical migration lock with no socket blocks installation changes unchanged.
- Actual private GNOME Keyring 50.0 persistence/lock/MG01/native restart regression:
  [7/7 report](s36-install-coordination-os-2026-10-25/report.json),
  [TAP](s36-install-coordination-os-2026-10-25/tests.tap).
- `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`.
- `pnpm check:s36:settings-transfer`: cumulative inventory/preserved mappings,
  module sizes, pure browser/backend boundaries and original production/design hashes.
- `git diff --check`.

[Captured actual build](s36-install-coordination-artifacts-2026-10-25/report.json)
and [manifest](s36-install-coordination-artifacts-2026-10-25/release-set.json):
37 files, 3,600,798 bytes; externally pinned ID
`ab503ece89999d3152c3d1bc45050a4b38a6fff3a91f964f4f36affba118895b`.
Capture verifies integrity only; that set was not registered/delivered. Native
coordination tests use actual built daemon files in separately pinned synthetic
release fixtures and private installer directories. The paused helper is synthetic;
the separate OS regressions use actual private GNOME Secret Service.

## Limits

This excludes the updated installer tools and explicit packaged migration daemon
for one private directory. Ordinary S28/legacy daemons and all legacy/target source
writers are not integrated into this lock. Managed startup, normal-user deployment,
startup cancellation/forced-death cleanup and crash-stale ownership recovery remain
open. Forced termination during initialization may leave both locks; investigate
ownership before manual cleanup. No automatic takeover or all-writer freeze is
inferred. Original UI/production entrypoints/admission/designs remain unchanged.
No Chrome, live-provider, business holdout, Windows/macOS or production cutover
was exercised. Full [S36 remaining acceptance](../s36-remaining.md) still applies.
