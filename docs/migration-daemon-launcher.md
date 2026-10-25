# Explicit migration daemon launcher

The optional foreground launcher is an additive companion to the Linux qualification
installer. Build `pnpm build:s36:install`; use Node 22.23.2 and an already installed,
independently pinned release containing the packaged migration daemon. Ordinary
native-host installation does not create or start this companion.

```js
import {
  installDaemonLauncher,
  removeDaemonLauncher,
} from "./dist/s36/installation.mjs";

// The same trusted directory/registry/release ID/extension ID used by installRelease.
const configured = installDaemonLauncher(installedInput, "os-store");
// Or explicitly select "session-only". Neither call starts a daemon.
console.log(configured.launcher); // /absolute/private/agent/migration.sh
```

Execute that returned owner-private `migration.sh` directly, without arguments, to
run in the foreground. It pins the Node executable, release directory/ID, pairing
path, selected mode and `--installed`. It embeds no pairing secret or credential.
Its daemon independently verifies the release and active native installation.
Arguments are rejected rather than forwarded. OS mode still requires an available
unlocked persistent Secret Service and its external host dependencies; configuration
alone does not probe/unlock the store or establish credential readiness. There is
no service unit, background start, auto-restart or change to the product default.

`migration-launcher.json` records companion ownership and the exact script hash.
Install/update/removal hold the existing shared installation lock and require the
backend to be stopped. Foreign/changed files, malformed ownership or pairing changes
fail closed. A missing owned script can be repaired by repeating the same call.
An interrupted `installing` record only accepts its exact pending plan; interrupted
`removing` must finish removal before installation. Power-loss and malicious same-user
filesystem writers remain outside this qualification.

After an explicit native release switch, the old script remains pinned to the old
release and fails its installed-start check. With the daemon stopped, explicitly call
`installDaemonLauncher(newInstalledInput, sameMode)` to update it. Native release
transitions never change a companion mode or auto-start it. Real released-version
compatibility remains a separate gate; the tested sets share schema/protocol/version.

To change modes, stop the daemon, call `removeDaemonLauncher(installedInput)`, then
explicitly configure the new mode. This removes only the owned script/companion
receipt. It preserves pairing, SQLite, both artifact sets and OS credentials; it
does not migrate existing MG01 checkpoints or delete old credentials. Existing
checkpoint mode/readback gates still apply, so mode changes can require a separately
qualified migration/repair rather than continuing an old checkpoint.

Remove the companion before unregistering the native host. If native registration
is removed first, the leftover companion cannot start because `--installed` rejects
the inactive receipt; explicit companion removal remains available afterward.
Foreign files are preserved rather than deleted. No purge operation is inferred.
See [source](../apps/agent-server/src/migration/daemon-installation.ts),
[script plan](../apps/agent-server/src/migration/daemon-launcher-plan.ts) and
[dated native/OS evidence](evidence/s36-daemon-launcher-2026-10-25.md).
