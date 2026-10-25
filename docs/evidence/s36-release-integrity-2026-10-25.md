# S36 release artifact integrity and rollback guard — 2026-10-25

**In Progress — partial S36-C5/C6 integrity qualification.** Actual isolated S28 artifacts now have a bounded, independently pinned release-set manifest and a verifier exercised through the six-unit rollback coordinator. This does not close S36, establish a complete release candidate or advance S37 beyond Planned.

Parent `54a6c2fd0454d630c32f2a2372cf543cb0144a16` plus uncommitted release-integrity changes; Linux x64, pnpm 9.15.4, Node 20.19.6 for type/unit/build and Node 22.23.2 for SQLite/verifier/capture. Product extension version remains 0.1.117. No provider calls, business actions, actual approvals, installed-host changes or deliveries.

## Implemented behavior

- [Shared contract](../../packages/shared/src/release-set.ts) limits releases to qualification-only, Linux, explicit session-only credentials and three fixed artifact roots. Every file has a canonical relative path, SHA-256 and byte size. Duplicate/missing component inventory, unknown fields, traversal and malformed values are rejected.
- [File inventory](../../apps/agent-server/src/migration/release-files.ts) traverses all three component trees; rejects symlinks, special files, unsafe names, excessive depth/node/file counts and byte totals before hashing. Limits: 64 MiB/file, 256 MiB total, 4,096 files, 8,192 visited nodes, depth 24. It never enumerates pairing directories or credentials by default.
- [Release verifier](../../apps/agent-server/src/migration/release-set.ts) hashes a strict canonical manifest, requires an independently pinned ID, rereads every artifact on every check and rejects extra top-level files. Extension/root package version, backend/browser package identity and versions, protocol, Linux architecture and exact recorded Node version must agree. The manifest's Node minimum is 22. The original lockfile and package/workspace manifests are content-pinned; this is not a claim that every installed dependency or provider was independently qualified.
- [Capture command](../../scripts/s36/release/capture.mjs) copies the actual S28 isolated browser/backend outputs plus dependency metadata into a fresh directory, writes the manifest and verifies it. It refuses to overwrite any existing destination. Failure may leave a partial output for diagnosis. [Usage and trust boundary](../migration-release-integrity.md) explain how to retain the expected ID separately and rerun verification.
- `releaseIntegrityPredicate` is an integrity prerequisite, not full runtime/data compatibility. A controlled native fixture injects it into the real `ComposedMigrationPort` rollback compatibility port. The previous artifact ID is bound in the actual migration manifest. If the old backend artifact changes after commit, rollback raises `INCOMPATIBLE_RELEASE`, the fence advances, the old journal cannot resume under the new epoch, and admission stays zero. An intact controlled artifact set completes namespace rollback without replay or duplicate cancellation.

The rollback fixture uses synthetic artifacts; its six converters, SQLite journal, IndexedDB implementation and legacy lifecycle are real controlled implementations. The separate capture below uses actual freshly built S28 artifacts. Integrity records are not signatures, authorization or OS/live compatibility receipts. A future production caller must combine integrity with real schema/runtime/release compatibility and authenticated installed ownership. This code is not registered in production. It assumes a trusted quiescent artifact directory and does not claim an atomic snapshot against concurrent hostile writers.

## Actual artifact capture

[Machine report](s36-release-artifacts-2026-10-25/report.json), [full file manifest](s36-release-artifacts-2026-10-25/release-set.json).

- Release ID: `2dffb8436c2c376177950ead935f75ad75dd628074eb40d92993959716a43689`.
- 34 files; 1,965,504 bytes. Extension 0.1.117; backend/browser app package versions honestly remain 0.0.0; protocol 1.0; session-only credentials.
- These are the S28 isolated bridge artifacts, not a packaged S29–S36 runtime. Source revision has an explicit dirty-worktree marker; this is not a reproducible clean release reference. Snapshot metadata and artifact hashes are preserved even if later local source changes.
- The candidate is local under `dist/s36/release-candidate-2026-10-25`; registered/installed/delivered are all false. Nothing was written to the user's Chrome native-host registration directory.

## Executed checks

| Check | Result / scope |
| --- | --- |
| `pnpm build:s28` | PASS, actual isolated browser/backend/package artifacts; two pre-existing upstream Zod pure-annotation warnings |
| `pnpm build:s36:release`, `pnpm build:s36:integration` | PASS, standalone verifier and controlled integration bundles |
| Node 22.23.2 `scripts/s36/release/capture.mjs dist/s36/release-candidate-2026-10-25` with `S36_RELEASE_EVIDENCE_DIR=docs/evidence/s36-release-artifacts-2026-10-25` | PASS; fresh artifact copy, manifest and complete reread against pinned ID |
| Node 22.23.2 `--test scripts/s36/release/*.test.mjs scripts/s36/integration/*.test.mjs` | PASS, 14/14: six new release/rollback checks plus eight integration regressions |
| `pnpm test:unit` | PASS, 1,348/1,348 in 274 files; S36 now 95 checks including four new release-contract cases |
| `pnpm test:fixture`, `pnpm test:e2e` | PASS, 1/1 each |
| `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries` | PASS, 423 legacy extension modules checked |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS, development artifact; version unchanged |
| `pnpm check:s36:release`, `git diff --check` | PASS; cumulative inventory, bounded modules, browser/backend boundaries and preserved original production/design hashes |

Tests cover independently pinned identity, missing/changed/extra files, lockfile changes, extra root entries, symlinked files/directories/manifest, metadata/protocol/version/architecture skew, unsupported credential claims, oversized sparse files and actual migration rollback behavior. No new Chrome run was needed for Node-only filesystem verification; prior controlled Chrome evidence remains scoped to its recorded revision. No first-attempt runtime/test failures occurred in this slice.

## Remaining gates

The complete target runtime artifact set, installed authenticated migration transport, real source/target writer freeze, OS secret-store persistence, clean install/upgrade/repair/uninstall, native-host registration/identity matrix, UI continuity, live provider/JEV, 100 Ask + 100 Action holdouts and real release/rollback operation remain unverified. The earlier S27 live failure and S28–S35 incomplete runtime gates remain open. Production entrypoints, original architecture/individual Sprint designs, UI and version are unchanged. The external Platform backlog dated 2026-09-06 remains unresolved. S36 stays In Progress; S37 stays Planned.
