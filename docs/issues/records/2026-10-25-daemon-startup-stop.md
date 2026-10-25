# ISS-20261025-002: Graceful stop during migration-daemon initialization

## Tracking

- Status: Resolved for the bounded explicit Linux daemon; deployment unverified.
- Occurrence/update: 2026-10-25 KST.
- Affected revision: `3d7fc70a193bba6830dfe47b8afeba7c7d54ed2b`, version 0.1.117.
- Fix: current uncommitted continuation; no deployment/version change.
- Related: [ISS-20261025-001](2026-10-25-install-daemon-coordination.md), which fixed
  installation exclusion but explicitly left startup cancellation open.

## Occurrence and cause

Signal listeners were installed only after `listenLocal` completed. During an
awaited OS-store probe, SIGTERM/SIGINT therefore terminated the parent immediately,
leaving acquired installation/migration locks while its helper was outstanding.
The [pre-fix TAP](../../evidence/s36-startup-stop-artifacts-2026-10-25/before-fix.tap)
reproduces this against the parent build for both signals. This is a controlled
local lifecycle reproduction, not evidence of a user deployment incident.

## Fix and boundaries

Listeners now exist before asynchronous initialization. A stop request records a
flag. Checks after pairing read and OS-store connect reject further startup;
if a signal arrives while listening is being established, the resulting server
is closed through the same memoized shutdown path. Repeated signals share that
path. Cleanup closes SQLite and releases acquired locks only after outstanding
startup work completes. It does not release another owner's lock/socket.

A successful probe followed by a stop request exits normally without creating
SQLite/socket. A failed probe remains a failure (exit 1), even if stop was requested.
The existing helper operation is bounded to five seconds; this change waits for
that operation rather than assuming an aborted helper has completed. No secret
write happens during this probe. SIGKILL, crashes, arbitrary I/O failure and stale
lock recovery remain outside graceful cancellation support.

## Regression acceptance

- SIGTERM during a gated successful probe, repeated: retain ownership until the
  helper completes, suppress database/socket startup, release owned locks, permit
  repair/unregister afterward. PASS.
- SIGINT under the same conditions, repeated: same result. PASS.
- SIGTERM during a gated failing probe: same cleanup, with failure exit preserved. PASS.
- Related ISS-20261025-001 pre-socket/live/shared/historical lock checks pass.
- Native daemon/installation/release/transport/settings checks: 42/42; actual
  private GNOME Secret Service/MG01 persistence/restart checks: 7/7.

Node 22.23.2 subprocesses and private directories establish this bounded acceptance.
The gated helpers are synthetic; separate OS regressions use private GNOME Keyring
50.0. No real desktop keyring, Chrome/live provider or deployment was exercised.
[Evidence](../../evidence/s36-startup-stop-2026-10-25.md) records commands and limits.

## History

- 2026-10-25: parent failure reproduced for SIGTERM and SIGINT; TAP retained.
- 2026-10-25: early signal observation, startup checks and shared cleanup implemented;
  bounded native/OS regression acceptance passed; broader S36 remains In Progress.
