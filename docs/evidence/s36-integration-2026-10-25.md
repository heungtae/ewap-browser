# S36 six-unit coordinator integration — 2026-10-25

**In Progress.** The actual MG01–MG06 staging implementations now compose with the migration coordinator through explicit owner ports. This is controlled integration qualification, not production migration or full S36 acceptance. S37 remains Planned.

Parent: `1fdb918a9a1eb5c154ec0cb85121221f6c094670` plus the uncommitted integration changes. Linux, pnpm 9.15.4, Node 20.19.6 for TypeScript/Vitest/build and Node 22.23.2 for native SQLite; Chrome 147.0.7727.15. Product version remains 0.1.117. Zero provider calls, business actions, new approvals, production routing changes or deliveries.

## Source and protocol

- [Shared contracts](../../packages/shared/src/migration.ts) validate exhaustive source digests, bounded/count-balanced checkpoints, six-checkpoint validated/committed journals and strict profile/epoch/digest owner acknowledgments. Existing unprofiled foundation journals remain readable by the old coordinator; the new composed session rejects them rather than silently claiming profile ownership.
- [Browser owner](../../apps/chrome-extension/src/migration/owner.ts) uses the existing five browser staging implementations, including MG02's actual policy mirror protocol and the explicit legacy digest adapters. It freezes through the injected owner port, drains before snapshot hashing, rereads every source and browser target, and [persists its acknowledgment](../../apps/chrome-extension/src/migration/owner-ack.ts) in profile-specific IndexedDB. MG01 browser ownership verifies only the original settings source; its secret-bearing target is exclusively verified by the backend.
- [Composed backend port](../../apps/agent-server/src/migration/session-port.ts) binds the actual MG01 SQLite/settings service, browser profile, frozen source epoch and coordinator journal. [Session](../../apps/agent-server/src/migration/session.ts) collects source digests after drain, validates all six targets before both acknowledgments and commit, and checks the durable browser acknowledgment. Missing session secrets, source drift, expired diagnostics and missing MG02 mirror block commit.
- Existing compare-and-swap journal, closed-admission fence and release compatibility gate remain in force. Rollback advances the epoch and chooses the preserved legacy qualification namespace without replaying actions. The namespace pointer is qualification-only: its SQLite constraint keeps admission at zero even after commit. No distributed atomic transaction is claimed between IndexedDB and SQLite. A failure after namespace selection but before the final journal marker leaves admission closed; retry revalidates and finishes without another action/cancellation.

The caller must supply authenticated ownership/transport and a real freeze covering all source/target writers. The current source, lifecycle-inventory, CDP and transport ports are controlled test composition. Actual legacy lifecycle cancellation and persistence run in the native fixture, but its browser effects, selection inventory and CDP reconciliation are controlled. Ports are not registered in production. Owner acknowledgments are consistency records, not authorization or signature receipts.

## Executed checks

| Check | Result and scope |
| --- | --- |
| `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries` | PASS; 423 legacy extension modules in the boundary check |
| `pnpm test:s36` | PASS, 91/91 in 18 files, including four new boundary-contract checks |
| `pnpm test:unit` | PASS, 1,344/1,344 in 273 files |
| `pnpm test:fixture`, `pnpm test:e2e` | PASS, 1/1 each |
| `pnpm build:s36:integration`; Node 22.23.2 `--test scripts/s36/integration/*.test.mjs` | PASS, 8/8; actual six converters, file-backed SQLite, controlled fake IndexedDB and actual legacy lifecycle |
| `pnpm build:s36`; Node 22.23.2 `--test scripts/s36/sqlite.test.mjs` | PASS, 1/1 original durable fencing/CAS/ack/rollback regression |
| `CHROME_FOR_TESTING_BIN=... S36_INTEGRATION_EVIDENCE_DIR=docs/evidence/s36-integration-chrome-2026-10-25 pnpm test:chrome-s36:integration` | PASS, six controlled real-Chrome IndexedDB owner checks; [report](s36-integration-chrome-2026-10-25/report.json) |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS, development artifact; version unchanged |
| `pnpm check:s36:integration`, `git diff --check` | PASS; cumulative inventory, bounded modules, browser/backend boundaries and preserved original production/design hashes |

Native scenarios cover all-six agreement, original-source preservation and sensitive canary absence from backend journal/settings/mirror; restart and session-secret readback failure; unknown dispatch/CDP blocking; new-epoch rollback; expiry/source drift after both acknowledgments; a durable browser acknowledgment with lost response; final journal-write interruption; missing policy mirror. The native bundle deliberately contains synthetic fixture canaries; it is never a product artifact. The source-boundary check separately bundles actual backend source without fixtures.

Chrome runs all five browser target stores with a controlled in-memory policy mirror. MG01's browser source digest is real, while its target checkpoint is explicitly synthetic; the native suite establishes actual MG01 target/secret readback. Chrome checks durable profile-bound acknowledgment, database reopen/idempotency, cross-profile rejection, missing checkpoint rejection and expiry invalidation. It does not establish installed extension/backend IPC or browser-restart source freeze.

The first Chrome harness bundle failed because a reused MG01 test helper imported Node-only settings code. The browser fixture now supplies a local source-only settings value, keeping backend helpers out of its bundle. The corrected run passed; no production fallback was introduced.

## Remaining acceptance

Installed authenticated transport, real source/target writer freeze and restart ownership, OS credential storage/setup, UI/history/settings continuity, native installer/upgrade/cleanup, live provider/JEV qualification, the planned 100+100 holdouts and release/rollback operation remain unverified. Prior S27 live failure and unresolved S28–S35 runtime/product gates are not cleared by these fixtures. Production entrypoints, original architecture/Sprint designs, UI and version are preserved. The original cross-repository Platform backlog dated 2026-09-06 remains external and unresolved.
