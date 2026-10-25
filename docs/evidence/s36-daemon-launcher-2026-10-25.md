# S36 explicit foreground daemon launcher — 2026-10-25

Parent `e5b926d2a4ae1ddc80d49c10014250fa94732990` plus uncommitted browser-restart,
resume-preflight and this opt-in companion-installer slice. Version 0.1.117; S36
In Progress and S37 Planned. Existing earlier changes are retained.

## Implemented behavior

New `installDaemonLauncher(input, mode)` validates a pinned package and the active
native installation under the existing shared lock, then writes an owner-private
foreground script plus strict ownership receipt. It pins executable/release ID/
configuration and selects exactly one mode; it starts nothing. Unsupported packages
and invalid modes fail without configuring a script. The existing main native
installation receipt/schema, normal daemon, default store, UI and production routing
are unchanged.

Companion removal/update shares install/daemon exclusion. A changed/foreign script
or malformed ownership blocks writes/deletion. Partial `installing` supports exact
plan retry; pending removal must complete first. Mode changes require explicit
removal/reconfiguration and do not migrate/purge credential/checkpoint data. Native
release switching leaves the companion pinned to its old set; it cannot run until
explicitly updated to the selected installed release. Unregistering the native host
also makes a leftover companion fail startup. Pairing and OS items survive removal.

## Executed verification

Node 22.23.2, pnpm 9.15.4 on Linux:

- `pnpm build:s36:install`: updated qualification installer bundle exports both APIs.
- Expanded native daemon/install/release/integration/transport/settings tests:
  [66/66 TAP](s36-daemon-launcher-native-2026-10-25/tests.tap). The three new tests
  execute actual generated scripts and registered native host subprocesses, check
  no automatic start, private mode, argument rejection, live-lock exclusion, same-
  version release transition/stale wrapper rejection/explicit update, post-unregister
  rejection, missing-script repair, foreign/partial records and explicit mode change.
  No pairing secret is embedded in the script or companion receipt.
- Private GNOME Keyring 50.0 tests: [9/9 report](s36-daemon-launcher-os-2026-10-25/report.json),
  [TAP](s36-daemon-launcher-os-2026-10-25/tests.tap). The new case starts the actual
  generated OS-mode script, authenticates through the registered native wrapper,
  refuses startup with a locked private keyring, resumes after external fixture
  unlock, then removes the companion while a profile-scoped OS item remains readable.
  No user keyring is accessed. Configuration does not itself probe or unlock storage.
- `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`.
- `pnpm check:s36:settings-transfer`: unchanged-parent inventory, module-size/import
  boundaries and original frozen production/design hashes.
- `git diff --check`.

Tests use temporary owner-private installations and separately pinned synthetic
release fixtures containing actual built native launcher/daemon/helper files. This
is not delivery or a normal desktop/service installation. The earlier captured
actual package remains unchanged; the new companion installer is a separate updated
qualification tool bundle, not a new product artifact set. No version-changing
build or new Chrome run was needed for this companion-only slice.

## Remaining limits

Normal-user service/supervision/deployment, released-version compatibility, secret
purge/retention UI, power-loss/stale-lock recovery, actual writer freeze/drain,
installed global migration consensus/commit, full UI/history continuity and live
JEV/holdouts remain pending. Manual invocation of the new script still uses the
existing qualification daemon with admission closed; it does not prepare or commit
a global migration. No provider/business call, approval or production cutover.
[Operations](../migration-daemon-launcher.md) records lifecycle and mode limits.
