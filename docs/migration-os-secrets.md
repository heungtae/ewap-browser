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

The factory probes before returning an `os-store` instance. Each read/write repeats service/collection checks in a fresh helper process. Missing service, missing/locked default collection, unavailable session-alias comparison, session-only collection, locked/duplicate matching items, helper failure and timeout fail closed. The helper never unlocks/creates a collection and overrides synchronous libsecret prompting to refuse UI prompts. The user/OS must unlock the persistent collection outside this adapter. Actual qualification covers GNOME Keyring 50.0 only; other Secret Service providers, Windows and macOS are unverified.

Requests/secret responses use private process pipes, never command-line arguments. The Node adapter invokes a fixed `/usr/bin/python3 -I` and forwards only required D-Bus/XDG/locale environment values, excluding unrelated provider-key environment variables. Identity attributes contain a SHA-256 identity digest plus explicit profile namespace and constant application/schema identifiers. Raw provider identity, endpoint, API key and headers are absent from labels/attributes. Profiles and identities are namespaces, not an ACL against other processes of the same OS user. Secret Service and the OS session must be trusted.

The adapter bounds request/value/output sizes and execution to five seconds, masks errors, and refuses NUL/oversized values. It never falls back to a session map or plaintext file. Strings necessarily exist in caller/helper memory during transfer; secure memory erasure or hardware-backed protection is not claimed. Existing settings/MG01 identity validation and secret readback remain authoritative; the adapter does not issue approvals or enable roles.

Credential items remain in the OS collection when native-host registration is removed. Automatic purge/delete is intentionally absent from `SecretStore`; operational removal/retention and real desktop install/upgrade/uninstall remain unqualified. Do not call this a complete OS deployment or default-store migration.

Run the isolated verification under Node 22.23.2:

```sh
pnpm build:s36:secrets
pnpm build:s36:integration
node scripts/s36/secrets/run.mjs
pnpm check:s36:secrets
```

The runner creates its own D-Bus session and temporary XDG data/runtime/control directories. It refuses a preexisting Secret Service owner on that test bus, copies the helper privately, uses a generated fixture password through stdin, and starts/stops its own foreground GNOME daemon. Test unlock is an explicit private-daemon restart with that fixture password, not an adapter feature. The user's D-Bus/keyring/home environment is not repurposed. Failed test-process groups have a bounded cleanup deadline. Use `S36_SECRET_EVIDENCE_DIR` to retain TAP and a version/revision-scoped report. See [dated evidence](evidence/s36-os-secrets-2026-10-25.md).
