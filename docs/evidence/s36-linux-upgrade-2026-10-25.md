# S36 controlled Linux release-set switch and reverse — 2026-10-25

**In Progress — partial S36-C5/R05 transition recovery.** The Linux installer now explicitly switches between two pinned artifact sets and can switch back, while preserving pairing and installation ownership. Controlled interrupted states and actual isolated Chrome source → target → source communication passed. Cross-version product/runtime compatibility and full S36 acceptance remain unverified; S37 stays Planned.

Parent: `6919fbc871036fc78c4c38475fe6116304244dad` plus uncommitted transition changes. Linux x64; pnpm 9.15.4; Node 20.19.6 for type/lint/Vitest/product build; Node 22.23.2 for native/Chrome/install tools; Chrome 147.0.7727.15. Product version remains 0.1.117. Zero provider calls, actual approvals, business dispatches, production routing changes or delivery. All registration changes were confined to disposable Chrome profiles.

## Implemented source

- [Transition service](../../apps/agent-server/src/migration/install-transition.ts) requires independently pinned source and target IDs/directories, verifies both complete trees, preserves installation/registry/extension identity and exact pairing, and refuses active backend sockets or competing installers. The original installer still rejects implicit release changes. A new switch requires an installed source receipt and intact owned files.
- [Transition plan/contract](../../apps/agent-server/src/migration/install-transition-plan.ts) records strict source and target installed receipts, executable/config ownership and distinct release identities. A durable journal is written before file replacement. Recovery accepts only source/target hashes and the exact caller-specified transition. Changed pairing, foreign files or another journal never become a new target.
- [Installation state helpers](../../apps/agent-server/src/migration/install-state.ts) retain the prior receipt and ownership checks. [Existing install/remove](../../apps/agent-server/src/migration/installation.ts) now refuse a pending transition. Target files and final receipt are written before durable journal removal; final-receipt/interrupted-cleanup retry is idempotent. A completed switch can be reversed by an explicit new call with swapped pinned inputs.

This is a filesystem selection protocol, not an atomic distributed transaction or a runtime/data migration. An interrupted source receipt can temporarily coexist with a target wrapper. The caller must keep the daemon and external auto-start mechanisms stopped until recovery finishes. No service manager is integrated. Both artifact trees must still verify on recovery, including the retained source; damaged/missing trees, stale locks/sockets and conflicting files require owner review. No automatic cancellation, forced journal rewrite, secret replacement or runtime admission was added. See [operations](../migration-linux-upgrade.md).

## Artifact and Chrome scope

[Derivation report](s36-linux-upgrade-artifacts-2026-10-25/report.json), [source manifest](s36-linux-upgrade-artifacts-2026-10-25/source-release-set.json), [target manifest](s36-linux-upgrade-artifacts-2026-10-25/target-release-set.json), [Chrome report](s36-linux-upgrade-chrome-2026-10-25/report.json).

Source ID `f912dc842af06c6e94feec8cd6a4060af5b6fdc3daaa06374d5bddf8e9d9a87a` reuses the prior freshly captured S28 bridge artifacts after complete integrity verification. Target ID `9fbb42d77c86893d6e2dcad5a32c2ba108727b98e829b5b8684cb0d7fa9f3d58` copies that tree and appends an explicitly labelled fixture comment to the executable backend bundle. Both have extension 0.1.117, backend/browser packages 0.0.0 and protocol 1.0. The derivation script verifies both IDs and records the modification; the target is not claimed to be an independently built product release. Original capture revision/dirty provenance is retained in both manifests; the new derivation report identifies this turn's parent/dirty state separately.

The real Chrome smoke loads the source extension, installs/repairs its private native host and authenticates with its daemon. While the daemon runs, both unregister and transition are blocked. After shutdown it switches the wrapper/receipt to the target, starts the target bundle and reconnects using the same pairing. After stopping the target it explicitly switches back, starts the source daemon and observes authenticated capabilities (`taskReady: false`, `SESSION_ONLY`). Host-wrapper paths are independently checked at both selection points. Final unregister preserves pairing and removes the owned files. The protocol/implementation are intentionally the same; this validates selection, persistence and transport continuity rather than semantic cross-version compatibility.

The synthetic Node fixture additionally supplies 0.1.117/0.1.118 metadata and different fixture backend bytes. Those are test-only artifacts, not a product version bump or released-version matrix. No browser extension update or data-schema downgrade was performed in Chrome.

## Executed checks

| Check | Result / scope |
| --- | --- |
| `node scripts/s36/install/build.mjs` | PASS, isolated installation/transition exports |
| Node 22.23.2 `scripts/s36/install/upgrade-artifacts.mjs SOURCE PINNED_ID TARGET EVIDENCE` | PASS, verified old set, explicit fixture derivation and complete target reread |
| Node 22.23.2 `--test scripts/s36/install/*.test.mjs scripts/s36/release/*.test.mjs scripts/s36/integration/*.test.mjs` | PASS, 28/28: four new transition checks and 24 regressions |
| `node --test scripts/s28/install.test.mjs` | PASS, original installer regression 1/1 |
| Node 22.23.2 `scripts/s36/install/upgrade-chrome.mjs` with source/target pins and Chrome/evidence env values | PASS, real isolated forward/reverse bridge handshake, active-transition block and retained pairing |
| `pnpm test:unit` | PASS, 1,348/1,348 in 274 files |
| `pnpm test:fixture`, `pnpm test:e2e` | PASS, 1/1 each |
| `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries` | PASS, 423 legacy extension modules |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS, development artifact; version unchanged |
| `pnpm check:s36:upgrade`, `git diff --check` | PASS, cumulative inventory, bounded sources, import boundaries and preserved original production/design hashes |

Native cases cover forward/reverse/idempotent selection; pending journal before replacement, target launcher, target registration, final target receipt and missing-file recovery; ordinary-operation blocking; active socket, invalid target, foreign files, pairing mutation, identity mismatch and incomplete installed source; journal tampering and preserved evidence on failure. Interrupted states are constructed controlled filesystem fixtures, not arbitrary process-kill/power-loss proof. No first-attempt test/runtime failures occurred in this slice.

## Remaining acceptance

Actual released-version compatibility/extension updates, schema upgrade/downgrade, installed authenticated MG transport and real writer freeze, complete target-runtime packaging, normal-user deployment/service management, OS credential persistence, Windows/macOS, UI continuity, live JEV/provider and 100+100 holdouts remain open. S27's failed live qualification, incomplete S28–S35 runtime gates and external Platform backlog dated 2026-09-06 remain unchanged. Production entrypoints, original architecture/individual Sprint designs, UI and product version are preserved. S36 stays In Progress; S37 stays Planned.
