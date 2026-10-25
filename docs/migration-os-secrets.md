# Explicit Linux Secret Service storage

`LinuxSecretServiceStore` implements the existing backend `SecretStore` through the OS Secret Service/libsecret API. It is explicitly selected by a trusted backend composition; the normal application and native bridge still default to `SessionSecrets`. The adapter adds no remote activation or automatic credential migration. The separately configured [MG01 transport](migration-settings-transfer.md) can explicitly select this store.

```js
import { LinuxSecretServiceStore } from "./dist/s36/linux-secret-store.mjs";

const store = await LinuxSecretServiceStore.connect(
  absoluteTrustedHelperPath,
  authenticatedProfileGuard,
);
// Inject `store` into the existing SettingsService or MG01 settings migration service.
```

Build with `pnpm build:s36:secrets`. The tested host has `/usr/bin/python3`, PyGObject, libsecret's Secret-1 typelib, an already-running GNOME Secret Service and an unlocked persistent default collection. Install a trusted copy of [secret-service.py](../native-host/secret-service.py) at the helper path with permissions excluding group/world writes, e.g. an owner-private installation directory and 0600 script file. Python interprets the file directly; an executable bit is unnecessary. Source checkouts with group-writable files must not bypass the check. Treat the helper and installation directory as trusted executable code; this is not protection against a malicious same-user filesystem writer.

For an explicit qualification package, build `pnpm build:s28`, `pnpm build:s36:release` and `pnpm build:s36:secrets`, then run:

```sh
node scripts/s36/release/capture.mjs /absolute/fresh/release-directory --linux-secrets
```

This copies the built adapter, helper and explicit daemon into `agent-server/linux-secret-store.mjs`, `agent-server/secret-service.py` and `agent-server/migration-daemon.mjs` with mode 0600. All three files are included in the externally pinned release-set hash. Historical adapter/helper-only packages remain valid but do not provide the new daemon. Partial packages, modified content and group/world-writable helper/adapter files fail release verification. Rebuild before capturing to avoid packaging stale outputs. Without the flag the ordinary bridge package stays unchanged. The release manifest's `credentials: session-only` still describes the default; packaging this optional capability does not select or start it.

The isolated installer registers a launcher referencing the verified release directory; it does not copy the tree or start a settings daemon. A trusted composition can import the packaged adapter and explicitly pass that package's absolute helper path. New packages also provide the explicit daemon described below. Python, PyGObject/libsecret and the running unlocked Secret Service remain external host prerequisites; they are not bundled or installed automatically. The [package evidence](evidence/s36-secret-package-2026-10-25.md) covers temporary registration and real private-keyring read/write through packaged files. Normal-user deployment and automatic selection remain unqualified.

The factory probes before returning an `os-store` instance. Each read/write repeats service/collection checks in a fresh helper process. Missing service, missing/locked default collection, unavailable session-alias comparison, session-only collection, locked/duplicate matching items, helper failure and timeout fail closed. The helper never unlocks/creates a collection and overrides synchronous libsecret prompting to refuse UI prompts. The user/OS must unlock the persistent collection outside this adapter. Actual qualification covers GNOME Keyring 50.0 only; other Secret Service providers, Windows and macOS are unverified.

Requests/secret responses use private process pipes, never command-line arguments. The Node adapter invokes a fixed `/usr/bin/python3 -I` and forwards only required D-Bus/XDG/locale environment values, excluding unrelated provider-key environment variables. Identity attributes contain a SHA-256 identity digest plus explicit profile namespace and constant application/schema identifiers. Raw provider identity, endpoint, API key and headers are absent from labels/attributes. Profiles and identities are namespaces, not an ACL against other processes of the same OS user. Secret Service and the OS session must be trusted.

The adapter bounds request/value/output sizes and execution to five seconds, masks errors, and refuses NUL/oversized values. It never falls back to a session map or plaintext file. Strings necessarily exist in caller/helper memory during transfer; secure memory erasure or hardware-backed protection is not claimed. Existing settings/MG01 identity validation and secret readback remain authoritative; the adapter does not issue approvals or enable roles.

Credential items remain in the OS collection when native-host registration is removed. Automatic purge/delete is intentionally absent from `SecretStore`; operational removal/retention and real desktop install/upgrade/uninstall remain unqualified. Do not call this a complete OS deployment or default-store migration.

Run the isolated verification under Node 22.23.2:

```sh
pnpm build:s36:secrets
pnpm build:s36:integration
pnpm build:s36:release
pnpm build:s36:install
node scripts/s36/secrets/run.mjs
pnpm check:s36:secrets
```

The runner creates its own D-Bus session and temporary XDG data/runtime/control directories. It refuses a preexisting Secret Service owner on that test bus, copies the helper privately, uses a generated fixture password through stdin, and starts/stops its own foreground GNOME daemon. Test unlock is an explicit private-daemon restart with that fixture password, not an adapter feature. The user's D-Bus/keyring/home environment is not repurposed. Failed test-process groups have a bounded cleanup deadline. Use `S36_SECRET_EVIDENCE_DIR` to retain TAP and a version/revision-scoped report. See [dated evidence](evidence/s36-os-secrets-2026-10-25.md).

## Explicit packaged migration daemon

Use Node 22.23.2 or the pinned compatible runtime from the release evidence. Keep
the expected release ID in trusted operator configuration outside the artifact
directory. With a prepared owner-private pairing directory:

```sh
node /absolute/release/agent-server/migration-daemon.mjs EXPECTED_RELEASE_ID /absolute/private/pairing.json --settings-os-store
# Alternatively, explicitly choose volatile credentials:
node /absolute/release/agent-server/migration-daemon.mjs EXPECTED_RELEASE_ID /absolute/private/pairing.json --settings-session-only
```

The daemon verifies its containing release before opening credentials, SQLite or
the socket. It loads only its packaged helper for OS mode, probes the OS store and
fails without falling back. Pairing must be private and its socket must be exactly
`agent.sock` in the same canonical private directory. Unknown modes/extra arguments
are rejected. The database is `migration.sqlite` in that directory. A private
exclusive `migration-daemon.lock` prevents concurrent instances; the daemon also
holds the shared `install.lock` before reading pairing or probing the OS store and
through server/database shutdown, excluding install/repair/unregister/transitions; an existing socket
also blocks startup and is never removed as a startup recovery action. Graceful
SIGTERM/SIGINT is observed during initialization as well as runtime. A stop during
the OS probe retains the locks until the existing bounded helper call settles,
then suppresses further startup and releases owned locks. Repeated signals share
one shutdown path; an actual probe failure still exits with failure. Runtime stop
closes clients/database before releasing locks. SIGKILL or a crash can
leave locks/socket; investigate ownership and stop all old writers before manual
recovery. The daemon never guesses that a lock is stale or takes over an endpoint.

This is opt-in qualification composition, not a managed desktop service or product
startup change. It exposes the existing authenticated status/MG01/MG02 commands;
it cannot prepare/fence/commit/activate migration remotely. Actual source-owner
freeze and prepared journal creation still require trusted local orchestration.
The packaged bundle excludes test fixture imports. [Evidence](evidence/s36-packaged-daemon-2026-10-25.md)
separates native OS restart qualification from full installed orchestration.
Run `pnpm test:s36:daemon` under Node 22 after the release/secrets/transport builds.

## Binding explicit startup to an installation

After installing the same pinned release with the qualification installer, add
`--installed` as the final argument:

```sh
node /absolute/release/agent-server/migration-daemon.mjs EXPECTED_RELEASE_ID /absolute/private/pairing.json --settings-os-store --installed
```

This mode checks the active installation receipt, canonical private registry,
matching release/executable/pairing and complete generated wrapper/registration
under the lifetime installation lock before probing secrets or opening SQLite.
It rejects pending transitions, partial/uninstalled receipts and missing/altered
owned files. It never repairs installation implicitly. Use the installer to finish
repair/transition before starting; after a release switch invoke the newly selected
package with its independently pinned ID. The old package is rejected in installed
mode. Removing registration also prevents this installed mode from starting.
The same flag works with explicit Session-only mode.

Without the flag the explicit standalone qualification mode still accepts a private
pairing configuration without requiring installation. The flag is a local startup
choice, not a remote grant or defense against a malicious OS user. No service unit
is installed/started automatically. [Dated native/OS evidence](evidence/s36-installed-start-2026-10-25.md)
records same-version forward/reverse selection and private-keyring locked startup.

For a generated foreground command pinned to an active installation and explicit
mode, use the optional [companion launcher](migration-daemon-launcher.md). It does
not install a service, unlock storage, migrate existing checkpoint modes or purge
OS items on removal. [Native/OS evidence](evidence/s36-daemon-launcher-2026-10-25.md)
keeps temporary qualification separate from normal-user deployment.
