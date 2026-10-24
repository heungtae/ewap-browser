# S36 migration coordination foundation — 2026-10-21

Status: **In Progress**. This is isolated protocol/storage verification, not release qualification or a cutover authorization.

## Revision and environment

Parent: `cffaf3ae6389245da3a06f908531ef5d4ecaa361` plus the uncommitted S36 files listed in this record. Linux; pnpm 9.15.4; Node 20.19.6 for TypeScript/Vitest/build, Node 22.23.2 for native SQLite. Product version remains 0.1.117. No model/client/OS-install attempt was made in this slice. There were zero model calls, browser dispatches, approvals and production namespace changes.

## Source and actual behavior

- [Coordinator](../../apps/agent-server/src/migration/coordinator.ts): MG01–MG06 checkpoint protocol; immutable source digests and schema/release identity; resumable per-store checkpoints; count reconciliation including quarantine; target validation; extension/backend acknowledgments bound to the manifest digest and epoch; compatible-release rollback after draining.
- [SQLite journal](../../apps/agent-server/src/migration/journal.ts): WAL/FULL durability, revision CAS, canonical manifest digest, persistent admission fence and namespace pointer. Concurrent fencing invalidates old writes/activation. Target activation requires the persisted validated journal and both matching acknowledgments. Admission stays closed even when the isolated pointer changes.
- [Unit tests](../../extension/tests/unit/migration/s36/coordinator.test.ts): quota failure/reconstruction, source drift, manifest conflict, failed validation, stale/missing acknowledgment, uncertainty and incompatible rollback. The port is controlled memory storage, not Chrome/SQLite integration.
- [Native SQLite drill](../../scripts/s36/sqlite.test.mjs): real on-disk close/reopen, persisted journal/fence, rejected early activation, dual acknowledgment, concurrent connection fencing and retained target checkpoints during legacy namespace selection.

`MigrationPort` is a trusted composition boundary. Its implementer must freeze admission and source writes, provide immutable snapshots, persist idempotent per-unit staging, validate target readback, drain actual runtimes and reconcile uncertainty. No browser/model-supplied record may implement this boundary. The coordinator never copies legacy approvals, refs or values as authority. This slice does not implement the six actual data converters or a production admission hook. The SQLite pointer is qualification state, not the existing product runtime selector. No transaction spans extension IndexedDB and backend SQLite.

## Executed checks

| Command | Result and bounded scope |
| --- | --- |
| `pnpm typecheck` | PASS, includes apps and tests |
| `pnpm lint` | PASS, ESLint and formatting |
| `pnpm exec vitest run extension/tests/unit/migration/s36` | PASS, 6/6 |
| `pnpm test:unit` | PASS, 1,259/1,259 across 256 files |
| `pnpm test:fixture` / `pnpm test:e2e` | PASS, 1/1 each |
| `pnpm build:s36` | PASS, isolated Node bundle; no version increment |
| Node 22.23.2 `--test scripts/s36/sqlite.test.mjs` | PASS, 1/1 real SQLite drill |
| `pnpm exec tsc -p tsconfig.build.json && node scripts/build-extension.mjs && node scripts/validate-package.mjs` | PASS, development extension package; no version increment |
| `pnpm check:s36` | PASS, 1,562 inventoried files, 7 bounded S36 modules; original production/design hashes unchanged |
| `git diff --check` | PASS |
| `pnpm check:module-boundaries` | PASS, 423 extension modules; S36 checks separately bound new modules |

No failed test was observed in these runs. Fault injection deliberately throws quota, uncertainty, incompatible release, acknowledgment and stale CAS errors; these are expected negative outcomes, not successful conversions. Source originals are never written by these components. Pending checks below must not be inferred from the passing protocol drill.

## Card/scenario disposition and release gates

- **C1/R01 partial:** coordinator and backend durable journal implemented. Actual v1/v2/MG01–MG06 converters, private snapshots/backups, extension acknowledgment persistence, secret-store transfer/readback, malformed-record handling and cross-process interruption at every real conversion point remain unverified.
- **C2/R02 partial:** controlled unknown-dispatch stop and namespace rollback drill pass. Actual legacy/target task drain, CDP ownership reconciliation, prior release installation and full source restoration remain unverified. Target-only records remain retained inspection data; no reverse conversion exists here.
- **C3/R03 pending:** no current UI changes. Visual/DOM/focus/window continuity against M00 and full target-product integration have not been qualified.
- **C4/R04 pending:** no 100 Ask / 100 multi-step Action holdout runs. No live JEV/GPT or advanced-adapter joint metric success is claimed. Prior Sprint live failures and incomplete prerequisite gates remain open.
- **C5/R05 pending:** isolated Linux SQLite execution does not qualify Linux installation, Windows/macOS, IPC ACLs, host registration, repair/uninstall, credential storage or a compatible release set.
- **C6/R06 partial:** source navigation, commands, inventory and this evidence are provided. No release candidate/cutover manifest, installer set, deployment, tag or release approval exists.

S32/S34/S35 and earlier incomplete runtime gates remain prerequisites. S36 cannot complete and S37 cannot start cutover from these checks. The original architecture and Sprint design documents remain pinned and unchanged. The original cross-repository Platform backlog, dated 2026-09-06, remains external and is not closed by this local slice.
