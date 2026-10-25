# S36 authenticated MG01 settings and secret transfer — 2026-10-25

**In Progress — actual MG01 transport, controlled source ownership.** MG01 source-bound copy/readback now crosses the real authenticated native bridge into the actual converter, SQLite journal and explicitly selected SecretStore. Actual Chrome Session-only behavior and isolated OS-backed RPC persistence passed. Source freezing/preparation are still controlled fixtures; full installed migration/S36 acceptance is not established. S37 stays Planned.

Parent `1ac8e74f2f154645a0f818168e115ceea625d77c` plus uncommitted settings-transfer changes. Linux x64; pnpm 9.15.4; Node 20.19.6 for type/lint/unit/build, Node 22.23.2 for native/OS/Chrome tools; Chrome 147.0.7727.15; GNOME Keyring 50.0 for the private OS run. Version remains 0.1.117. No real provider key was read, no provider call/business action/approval occurred, and no normal Chrome profile/keyring/production routing or delivery was changed.

## Source behavior

- [Shared source schemas](../../packages/shared/src/migration-settings.ts) relocate the existing pure MG01 schema definitions without changing local conversion behavior. The existing Node source module reexports them; the strict transfer parser validates provider/source fields at both privileged endpoints. Raw unrelated fields, structurally invalid sources and commands over 192 KiB are rejected before forwarding; remaining semantic repairs follow the existing quarantine rules. Larger local-source/chunked transfer remains unsupported here.
- [Client](../../apps/chrome-extension/src/migration/settings-rpc.ts) requires a trusted FrozenSource port, checks backend profile/ID/epoch/mode before reading keys, captures only provider settings and rechecks the source hash after the ACK. [RPC contracts](../../packages/shared/src/migration-rpc.ts) add explicit stage/validate operations and public ACK metadata only. Worker sender/pairing checks remain in force; NativeBridge checks the negotiated settings capability separately from policy/status.
- [Backend settings handler](../../apps/agent-server/src/migration/settings-rpc.ts) uses the real MG01 service and SQLite settings journal with a request-scoped source object; raw snapshots are not retained in SQL/maps. Profile/ID/epoch/source digest/current phase/admission and exact store mode are rechecked during work. The [endpoint](../../apps/agent-server/src/migration/rpc.ts) exposes it only with an explicitly injected store. The qualification daemon's new startup flags select Session-only or probed OS-store; no flag means no capability, and OS failure never selects Session-only automatically.
- The server now passes trusted envelope deadline/disconnect context to migration handlers. Existing serialized response correlation remains intact. MG01's guards stop subsequent work/publication after expiration/abort. A controlled abort during secret read proves zero subsequent writes/checkpoints. Already-issued writes may finish; no transactional secret purge or memory erasure is claimed. There is no remote prepare/fence/commit/activation command, and transferred provider roles stay disabled with controller failure stop.

[Operations](../migration-settings-transfer.md) describe explicit degraded mode, source ownership, payload/secret limits and recovery. A prepared source hash plus authenticated channel is not evidence that all real writers were frozen. Actual writer ownership/drain and global six-unit admission/commit remain separate incomplete gates.

## Real Chrome run

[Report](s36-settings-transfer-chrome-2026-10-25/report.json), [artifact report](s36-settings-transfer-artifacts-2026-10-25/report.json), [full manifest](s36-settings-transfer-artifacts-2026-10-25/release-set.json).

The final isolated bridge set is release `787366012dd4b587c225687389c780123c69948f374e65a232a778f330575f2b`, 34 files / 1,994,356 bytes; extension 0.1.117, backend/browser packages 0.0.0, protocol 1.0 and global Session-only defaults. Dirty provenance is explicit. The captured normal launcher remains bridge-only; the optional settings daemon is a separately built qualification tool, not silently packaged as a completed target runtime.

The test seeds synthetic provider settings in actual Chrome local storage, derives the authenticated pairing profile and prepares a controlled backend journal from that source digest. It opts its temporary daemon into Session-only mode and invokes the real Worker/native subprocess/daemon. One provider copies with no quarantine; checkpoint validation succeeds without API/header values in responses or SQLite. After daemon restart, validation fails on lost Session-only material; a fresh explicit source-bound stage restores the identical checkpoint. Revoking the client source guard prevents another transfer, original Chrome source stays unchanged, admission/task readiness remain false and CSP violations are zero. Other unit manifest digests are placeholders, not proof of all-six conversion. Actual source-writer freeze and browser-extension upgrade were not exercised.

## OS-backed RPC and regressions

[OS report](s36-settings-transfer-os-2026-10-25/report.json), [final TAP](s36-settings-transfer-os-2026-10-25/tests.tap), [initial failed fixture trace](s36-settings-transfer-os-2026-10-25/first-attempt.tap).

Five tests passed on a fresh private D-Bus/keyring: four preceding OS-store lifecycle/MG01 regressions plus authenticated MG01 native RPC using the actual OS-backed store. The new case starts the opt-in OS-mode daemon with a protected helper, copies credentials, restarts that backend daemon and validates without another copy. Locking the actual keyring blocks validation; SQL contains no source API/header canaries and admission stays zero. The OS run is native IPC, not an OS-mode Chrome run or normal desktop deployment. Its sources/preparation are controlled; no user keyring was accessed.

Six non-OS transfer tests cover v2 copy/readback and explicit Session-only reimport, mode mismatch/no downgrade, absent capability, wrong snapshot/stale epoch/unprepared journal, abort during read and v1 source conversion. Unit checks cover unavailable freeze guard, mode preflight before reading values, forbidden/oversized source and source drift after a reply.

## Initial failures

The first native test reused a NativeBridge after an intentionally rejected Session-only validation had retired that connection. The corrected fixture creates a fresh connection before the explicit copy; it does not turn failed validation into a retry/write. A fixture refactor then missed the formatted default argument, producing `settingsArguments is not defined` during startup; the retained initial OS trace records that setup failure. The default argument and initialization cleanup were corrected, and final native/OS/Chrome runs pass. No source digest, expected result, snapshot limits or readiness gate was relaxed.

## Executed checks

| Check | Result / scope |
| --- | --- |
| `node scripts/s36/transport/build.mjs`; `pnpm build:s28`; release capture | PASS, updated isolated tools and bridge artifact set; existing upstream Zod warnings |
| `pnpm test:unit` | PASS, 1,363/1,363 in 277 files; four new settings-transfer unit checks |
| `pnpm test:fixture`, `pnpm test:e2e` | PASS, 1/1 each |
| Node 22.23.2 expanded `--test scripts/s36/{install,release,integration,presentation,transport,settings-transfer}/*.test.mjs` | PASS, 44/44 including six new transfer/abort/v1 cases |
| Node 22.23.2 `scripts/s36/secrets/run.mjs` with new evidence directory | PASS, 5/5 private OS tests including actual OS-backed native RPC persistence |
| Node 22.23.2 `scripts/s36/settings-transfer/chrome.mjs` with pinned artifact/Chrome/evidence env values | PASS, actual Chrome source/native copy/readback, lost-session refusal, explicit reimport and revoked-source block; CSP violations 0 |
| `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries` | PASS, 423 legacy extension modules |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS, legacy development artifact; version unchanged |
| `pnpm check:s36:settings-transfer`, `git diff --check` | PASS, cumulative inventory, bounded modules, browser/backend boundaries and preserved original production/design hashes |

Actual writer freeze/drain/restart ownership, installed six-unit orchestration/global ACK/commit, large/malformed-source transport, normal helper packaging/retention/deployment, Windows/macOS, complete UI/live/100+100 holdouts and released-version/schema compatibility remain open. The preceding M00 UI gate stays BLOCKED and JEV preflight UNVERIFIED. The external Platform backlog dated 2026-09-06 remains unresolved. Product entrypoints, original architecture/individual Sprint designs, UI structure and version remain preserved. S36 stays In Progress; S37 remains Planned.
