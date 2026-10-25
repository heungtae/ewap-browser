# Controlled authenticated migration transport

S36 exposes a bounded MG02 mirror transport and metadata-only migration status over the existing authenticated S28 native bridge. This is not a full migration endpoint: no remote prepare, fence, source-secret transfer, commit, activation or rollback command exists. Source-writer freeze and complete coordinator composition remain pending.

Use pnpm 9.15.4 and Node 22.23.2 for the qualification daemon. Build `pnpm build:s28`, `pnpm build:s36:transport` and `pnpm build:s36:install`. [Install the pinned native host](migration-linux-install.md) into an explicitly selected isolated profile, then run:

```sh
node scripts/s36/transport/daemon.mjs /absolute/private/agent/pairing.json
```

This explicit daemon replaces the normal daemon for that private socket during qualification. Never start both owners. It reads the protected existing pairing, opens an owner-private `migration.sqlite` alongside it, binds the DB to a domain-separated hash of installation/profile IDs, and advertises optional `migration.status`/`migration.policy` capabilities. The normal launcher remains bridge-only and advertises neither capability. The new NativeBridge refuses migration requests unless the peer advertises the corresponding capability; earlier clients are not claimed compatible with the new optional service.

The protected directory must be private to the current Linux user; symlinked/non-private DB files are rejected and newly created files/SQLite sidecars use a private umask. Existing DB ownership cannot be rebound to another profile. Status returns only namespace, closed admission, fence epoch and journal ID/revision/epoch/phase; it omits source snapshots, credentials and checkpoint data.

`migrationTransport(profileGuard, request)` in the extension supplies a `PolicyMirrorPort` accepted by the real MG02 stager. The request callback must use the existing trusted extension UI → Worker → NativeBridge route. Worker sender IDs/URLs and the stored pairing scope remain authoritative. Arbitrary pages/content scripts and provider-selected commands do not receive a new management path. Both privileged endpoints validate policy values against the actual strict MG02 domain schema; the generic bridge's opaque policy value alone is not sufficient validation. Raw page/source/secret fields and unknown commands are rejected.

Put/read require a matching profile, migration ID, journal/fence epoch and admission zero. Put requires prepared/copying/validated phase; read also permits committed target ACK readback so idempotent post-commit validation continues to work. Put also matches the MG02 source digest from that journal, then delegates count/target-digest/revision/immutable-row checking to the existing SQLite mirror. Browser ACK validation checks profile/ID/epoch/revision and the complete value digest; the existing stager persists its own ACK only after readback. A new database has epoch zero and cannot prepare or fence itself through RPC. A policy mirror is consistency data, never an active permission or approval grant.

The server serializes at most sixteen queued frames per connection so asynchronous migration replies keep their original request correlation. Native requests retain the existing four-in-flight cap, expiry and message identity; after asynchronous digest calculation they recheck connection/capacity, timestamp at dispatch and clean up rejected posts. No cross-store transaction is assumed. Backend failures close the request channel without exposing raw errors, and stored put operations remain idempotent after lost responses.

MV3 browser bootstraps explicitly configure pinned Zod with `jitless: true`. This avoids evaluation probes/JIT code generation without weakening extension CSP. The native backend does not require this browser-specific setting.

Controlled checks:

```sh
pnpm build:s36:transport
node --test scripts/s36/transport/*.test.mjs
pnpm check:s36:transport
```

For `pnpm test:chrome-s36:transport`, use Node 22.23.2 and set `CHROME_FOR_TESTING_BIN`, `S36_INSTALL_RELEASE_DIR`, independently pinned `S36_INSTALL_RELEASE_ID` and a fresh `S36_INSTALL_EVIDENCE_DIR`. The runner seeds a controlled prepared journal and frozen source, loads actual Chrome IndexedDB, registers an isolated host, invokes the real Worker/native subprocess/daemon, restarts the daemon and checks readback. That trusted fixture seeding is not an operational procedure for claiming a real source freeze. All six-unit coordination, actual source-writer freeze/restart ownership, installed MG01 credential transfer and product release qualification remain open. See [dated evidence](evidence/s36-transport-2026-10-25.md).
