# S36 controlled Linux native-host lifecycle — 2026-10-25

**In Progress — partial S36-C5/R05 Linux lifecycle.** A content-pinned release set can now install, repair and unregister the S28 native host in an explicitly selected isolated Linux Chrome registry. Actual Chrome authenticated communication/restart and removal passed. This is not a full target-system installation, supported-OS matrix, version upgrade or S36 completion. S37 stays Planned.

Parent: `fe624b4f6bad0c248ecda46dae579e4583f06b24` plus uncommitted installation changes. Linux x64; pnpm 9.15.4; Node 20.19.6 for type/lint/Vitest/build, Node 22.23.2 for the new tools/native tests/Chrome runner; Chrome 147.0.7727.15. Product extension version remains 0.1.117. Zero provider calls, business dispatches, actual approvals or deliveries. All host registration changes were inside disposable test profiles, not the user's normal Chrome configuration.

## Implemented source and recovery

- [Installation service](../../apps/agent-server/src/migration/installation.ts) verifies the externally pinned release ID before creating installation state; checks private directories, exact identity and owned files; blocks all modification if a socket or another installer lock exists. It imports the same real release verifier as the prior slice. Different release IDs/paths or executable/extension/registry identity are rejected rather than treated as an implicit upgrade.
- [Plan and receipt](../../apps/agent-server/src/migration/install-plan.ts) reuse the existing native config schema, preserve exact pairing bytes and allow only one supplied extension origin for `ai.contextpilot.agent`. The wrapper points at the verified artifact directory and current Node executable. Receipt hashes bind pairing/host/registration without storing their raw contents. Malformed pairing/receipt errors are generic and do not echo input.
- [Filesystem owner](../../apps/agent-server/src/migration/install-files.ts) validates file/directory ownership, owner-private modes and symlink boundaries; bounds private reads; uses exclusive locking and fsync/rename file replacement. Receipt phases record installing/installed/removing/uninstalled. Partial operations can be retried under their phase; an interrupted removal cannot be silently reinterpreted as repair.
- Removal deletes only the owned registration and host wrapper, fsyncs affected directories, and keeps pairing, receipt, user data and artifact sets. Installation/registry roots cannot overlap the immutable artifact tree. Missing/damaged release directories do not prevent owned unregister. A changed foreign file or pairing stops removal rather than being overwritten/deleted. Reinstall of exactly the same identity keeps pairing unchanged. Process-death stale locks and stale sockets require owner review; no age-based automatic authority is inferred.

The directories are trusted local configuration. These checks are not a sandbox against concurrent malicious same-user filesystem writers. No atomic transaction spans installation and registry directories, and arbitrary power-loss/write-failure points remain unqualified. Runtime admission and credential persistence are unchanged. [Operational instructions](../migration-linux-install.md) document retained data, limits and manual stale-state handling.

## Actual artifacts and Chrome

[Artifact report](s36-linux-install-artifacts-2026-10-25/report.json), [file manifest](s36-linux-install-artifacts-2026-10-25/release-set.json), [Chrome report](s36-linux-install-chrome-2026-10-25/report.json).

The actual freshly built S28 isolated set has 34 files / 1,965,770 bytes and release ID `f912dc842af06c6e94feec8cd6a4060af5b6fdc3daaa06374d5bddf8e9d9a87a`. Extension 0.1.117, backend/browser app packages 0.0.0, protocol 1.0 and explicit session-only mode are preserved. Capture reports installed/registered false because it only prepares artifacts; the later Chrome report establishes isolated registration and communication. Dirty source provenance is explicit and does not identify a reproducible clean release.

The Chrome runner loads this exact captured extension, discovers its real extension ID, installs the bound host in its temporary registry, repairs a removed host wrapper and verifies unchanged pairing. It starts the real captured backend daemon, injects the fixture pairing into the existing bridge, observes authenticated `capabilities` (`taskReady: false`, `SESSION_ONLY`) and event-resume responses, and confirms removal is blocked while the daemon socket exists. After backend shutdown the bridge reports unavailable; after restart it reconnects without events/tasks. After final shutdown, unregister deletes both owned files, pairing remains unchanged and capabilities reports unavailable. Temporary daemon/profile processes and files are cleaned up.

The final unavailable response is observed after shutdown plus unregister; it alone does not distinguish daemon failure from missing registration. Filesystem checks independently establish registration removal. No installed migration transport/source freeze, operational task execution, full UI continuity or actual OS credential store is established by this bridge smoke.

## Executed checks

| Check | Result and scope |
| --- | --- |
| `pnpm build:s28` | PASS, actual isolated app/package outputs; existing upstream Zod annotation warnings |
| `pnpm build:s36:release`; Node 22.23.2 release capture with evidence directory | PASS, fresh complete tree and pinned-ID verification |
| `node scripts/s36/install/build.mjs` | PASS, standalone Node-only installation bundle |
| Node 22.23.2 `--test scripts/s36/install/*.test.mjs scripts/s36/release/*.test.mjs scripts/s36/integration/*.test.mjs` | PASS, 24/24: ten new installation/recovery checks and fourteen prior release/integration checks |
| `node --test scripts/s28/install.test.mjs` | PASS, original installer regression 1/1 |
| Node 22.23.2 `scripts/s36/install/chrome.mjs` with Chrome, release directory/ID and evidence env values | PASS, actual isolated native-host install/repair/authentication/restart/unregister scenario |
| `pnpm test:unit` | PASS, 1,348/1,348 in 274 files |
| `pnpm test:fixture`, `pnpm test:e2e` | PASS, 1/1 each |
| `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries` | PASS, 423 legacy extension modules |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS, development artifact; version unchanged |
| `pnpm check:s36:install`, `git diff --check` | PASS, cumulative inventory, bounded source, import boundaries and preserved original production/design hashes |

New negatives include foreign registration, altered pairing, unsafe permissions, symlink aliases/files, active socket, competing lock, malformed pairing masking, incompatible release identity and missing artifact directory during unregister. Mode assertions cover 0700 owner directories/wrapper and 0600 config/registration. Interrupted installing/removing phases are controlled filesystem fixtures, not a claim of exhaustive real power-loss testing. No first-attempt test/runtime failures occurred in this slice.

## Remaining gates

Actual cross-version upgrade/rollback install, normal-user/system registration/service management, Windows/macOS, OS credential-store persistence, complete target-runtime packaging, installed authenticated MG transport and real writer freeze, UI continuity, live JEV/provider and 100+100 holdouts remain open. S27's failed live qualification and incomplete S28–S35 runtime gates are unchanged. Original production entrypoints, architecture/individual Sprint designs, UI and version remain preserved. The external Platform backlog dated 2026-09-06 remains unresolved. S36 stays In Progress; S37 stays Planned.
