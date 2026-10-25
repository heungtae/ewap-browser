# ISS-20261025-001: Installation changes during migration-daemon preparation

## Tracking

- Status: Resolved for the bounded Linux qualification runtime; deployment unverified.
- Occurrence/update: 2026-10-25 KST.
- Affected revision: `6b3ae29dd3635b99cbea87a61a2b934c600a183b`, extension 0.1.117.
- Fix: current uncommitted continuation; no deployment/version change.
- Related issue: none; existing browser/UI issues have separate causes.

## Occurrence and cause

A controlled packaged OS helper pauses its probe before the daemon publishes a
socket. An already installed release can be repaired, removed or switched while
that daemon owns `migration-daemon.lock`: installers acquired only `install.lock`
and checked only `agent.sock`. The separate ownership mechanisms did not exclude
each other. The [pre-fix test](../../evidence/s36-install-coordination-artifacts-2026-10-25/before-fix.tap)
fails with `Missing expected exception` on install during that window. This is a
reproduced local lifecycle race, not a reported production deployment incident.

## Fix

`acquireInstallLock` exposes the existing exclusive install lock as an idempotent
release function. Install/repair/unregister/transition retain their scoped use;
the explicit packaged daemon now acquires the same lock before reading pairing
or awaiting the OS probe, and holds it through SQLite/server shutdown. Failed
startup releases only locks it acquired. An existing socket is still not removed.
Installers also reject historical `migration-daemon.lock` files without requiring
a socket, preserving conservative handling of older daemon instances.

No stale lock is automatically reclaimed. Forced death during startup can leave
both lock files; normal-user service supervision and crash recovery are separate
acceptance work. The ordinary S28 daemon and legacy source writers do not acquire
this new lifetime lock, so full writer freeze/managed startup is not claimed.

## Regression and acceptance

- R01: Pause actual packaged daemon at an OS probe, before socket publication;
  install, uninstall and transition must reject and leave receipt unchanged. PASS.
- R02: Hold a shared installer lock; new daemon must exit before database/socket
  creation and preserve the existing lock. PASS.
- R03: Live daemon blocks repair/unregister; graceful stop removes its locks/socket,
  after which repair/unregister succeed and pairing is unchanged. PASS.
- R04: Historical migration lock without socket blocks install/unregister and is
  preserved. PASS.
- R05: Release/installation/native transfer and real private OS restart/lock
  regressions: 39/39 native and 7/7 OS. PASS.

Checks use actual Node subprocesses and isolated directories under Node 22.23.2;
the paused probe is synthetic. Actual GNOME Keyring 50.0 checks use private D-Bus.
No user keyring, live provider, normal-user deployment or Chrome run was exercised.
The [dated evidence](../../evidence/s36-install-coordination-2026-10-25.md) records
commands, artifacts and limitations. The issue's acceptance scope is the bounded
installer/packaged-daemon exclusion above; full S36 remains In Progress.

## History

- 2026-10-25: reproduced against parent revision; failing TAP retained.
- 2026-10-25: shared lifecycle exclusion and historical-lock guard implemented;
  recorded local native/OS acceptance passed; deployment remains unverified.
