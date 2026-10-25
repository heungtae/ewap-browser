# Explicit MG01 settings transfer

The optional S36 migration daemon accepts MG01 stage and readback validation through the existing authenticated native bridge. Ordinary bridge/migration startup exposes no settings capability. Select exactly one backend store explicitly:

```sh
node scripts/s36/transport/daemon.mjs /absolute/private/pairing.json --settings-session-only
node scripts/s36/transport/daemon.mjs /absolute/private/pairing.json --settings-os-store /absolute/trusted/secret-service.py
```

New optional release packages also provide a [pinned explicit daemon](migration-os-secrets.md#explicit-packaged-migration-daemon) with no fixture dependency. The commands above remain controlled test runners.

The first mode deliberately stores credentials only in that daemon's memory. The second uses the explicit [Linux OS adapter](migration-os-secrets.md); unavailable/locked OS setup fails startup rather than downgrading. Do not run both daemon owners on one socket. Build the transport bundle first. These are qualification processes, not normal product startup or a complete release package.

The caller uses `settingsTransport(profileGuard, frozenSource, request)` from the extension. `frozenSource` is a trusted composition port with `assertFrozen(epoch)` and a reader limited to `provider_settings`; a JSON claim/provider instruction is not writer-ownership proof. Actual source-writer freeze and all-six installed ownership remain unimplemented. The controlled tests provide that port explicitly and do not qualify production migration.

```js
const port = settingsTransport(authenticatedProfileGuard, ownerFrozenSource, authenticatedRequest);
const checkpoint = await port.stage(migrationId, epoch, preparedSourceDigest, "os-store");
await port.validate(migrationId, epoch, checkpoint, "os-store");
```

Before reading credentials the client asserts its source guard and checks backend status for exact profile/ID/epoch and the requested store mode. It captures only provider settings, verifies the prepared digest, validates the domain shape, performs the request, then rereads/rechecks the source before publishing an ACK. A mismatch or revoked guard fails closed. The Worker retains the existing allowed-extension-page restrictions, pairing scope and strict domain parsing; NativeBridge requires the advertised settings capability. No web page or provider-selected payload acquires a new source-read or execution grant.

Backend requests require an existing profile-matching prepared/copying/validated migration journal, matching fence/epoch/source digest and closed admission. Validation may also read back a committed target; writes after commit remain forbidden. No remote command can create that prepared state, advance a fence, approve actions or commit/activate the migration. Store mode must exactly match the configured instance. The existing actual MG01 converter, SQLite journal, credential-identity boundary and secret readback define the result; provider roles remain disabled and controller failure remains stop.

Valid v1/v2 provider settings and an absent source are supported. Unexpected provider/source fields and structurally invalid rows fail before forwarding. Semantic credential/provider repairs remain subject to the existing converter and may produce reason-only quarantine; the checkpoint does not imply a usable/enabled provider. The complete command is limited to 192 KiB, below the 256 KiB framed bridge envelope limit. This bounded slice does not add large-source chunking or silently truncate the original local converter's broader source limit. Store-specific secret-value limits still apply.

Raw API keys and header values intentionally pass through the authorized local request/pipes into the selected SecretStore. They are request-scoped and never stored as source snapshots in backend SQL, exposed in ACK/status or written to logs. Local IPC authentication is not a claim of end-to-end transport encryption or memory zeroization. ACKs contain only binding, mode, verified checkpoint hashes/counts; they are consistency records, not approval tokens. The caller must trust the local backend and helper installation.

The server supplies deadline/disconnect context outside the JSON payload. MG01 checks it between awaited operations; aborted work cannot continue to later writes/publication. Already-issued store operations can finish after cancellation, so partial copied credential material may remain without a published checkpoint. No automatic purge or rollback is inferred; original source data remains intact. A lost reply is recovered by fresh guarded observation/copy, not hidden mutation retries.

Session-only backend restart loses credential material. Validate then fails without rewriting it. An explicit fresh source-bound stage can restore the same checkpoint while the journal remains copy-eligible; a committed Session-only migration may require a new compatible migration/repair flow. OS-backed credentials can validate across backend restart without another copy. Changing modes inside an existing checkpoint is rejected by the existing MG01 service rather than silently migrated.

Controlled checks (Node 22.23.2 for native/SQLite/OS runs):

```sh
pnpm build:s36:transport
pnpm test:s36:settings-transfer
pnpm build:s36:secrets
pnpm build:s36:integration
pnpm build:s36:release
pnpm build:s36:install
node scripts/s36/secrets/run.mjs
pnpm check:s36:settings-transfer
```

The Chrome runner uses the existing `CHROME_FOR_TESTING_BIN`, `S36_INSTALL_RELEASE_DIR`, independently pinned `S36_INSTALL_RELEASE_ID` and a fresh `S36_INSTALL_EVIDENCE_DIR`. `pnpm test:chrome-s36:settings-transfer` creates a temporary profile, seeds synthetic provider values, prepares a controlled journal, opts its private daemon into Session-only mode and checks actual transfer/restart/source revocation. No real provider account or desktop keyring is touched. [Dated evidence](evidence/s36-settings-transfer-2026-10-25.md) separates this from the private OS-backed native RPC run and the still-open full migration/release gates.

## Installed Chrome qualification

With a verified package containing the explicit daemon and Node 22.23.2 selected,
set the existing Chrome/release/pinned-ID/evidence environment variables above:

```sh
pnpm test:chrome-s36:installed-settings
pnpm test:chrome-s36:installed-settings:os
```

Choose a fresh evidence directory for each run. Both commands install only in a
temporary Chrome profile and launch the packaged daemon with `--installed`. The
first proves explicit Session-only loss/reimport across daemon restart. The second
creates its own D-Bus session/private GNOME keyring and verifies OS credential
readback after restart without another stage. It requires the same OS host tools
as the existing Secret Service fixture and never selects the desktop keyring.
The ordinary `test:chrome-s36:settings-transfer` command retains its original
controlled-daemon path. [Evidence](evidence/s36-installed-settings-chrome-2026-10-25.md)
distinguishes these scopes; source freeze/preparation remain controlled assertions.

For joint MG01/MG02 installed qualification, use
`pnpm test:chrome-s36:installed-joint` or
`pnpm test:chrome-s36:installed-joint:os` with the same pinned artifact/environment
and a fresh evidence directory. These additionally stage/mirror policy under the
same prepared profile/ID/epoch, reject source drift/wrong epoch before forwarding,
and validate both units after daemon restart. They do not prepare/commit a global
migration or qualify MG03–MG06 installed ownership. See [joint evidence](evidence/s36-installed-joint-chrome-2026-10-25.md).

To add MG03–MG06 and browser-owner ACK/reopen checks, run
`pnpm test:chrome-s36:installed-owner` or
`pnpm test:chrome-s36:installed-owner:os` with the same independently pinned
package/environment and a fresh evidence directory. These seed synthetic saved
workflow/history/terminal request/diagnostic data in actual Chrome stores and stage
all browser units in real IndexedDB, using the actual native MG01 checkpoint and
MG02 mirror. A browser ACK candidate is reopened and checked against missing unit,
profile and controlled diagnostic expiry failures. Backend remains prepared/legacy
with admission closed; no global consensus/commit or actual writer freeze is
qualified. [Six-unit evidence](evidence/s36-installed-owner-chrome-2026-10-25.md)
records the exact scope and remaining installed orchestration gates.
