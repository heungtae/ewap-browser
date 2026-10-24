# S36 MG03 advisory conversion — 2026-10-24

**In Progress.** Continuation of S36 C1/R01, not a new Sprint or S37 cutover. The plan ends at S37; incomplete conversion/qualification remains the next prerequisite work.

Parent revision: `401d0b0693fd17280a05c714d40731ba613cecd1` plus uncommitted MG03 changes. Linux; pnpm 9.15.4, Node 20.19.6, controlled Chrome 147.0.7727.15. Product version 0.1.117 and production/design hashes are preserved. Zero provider calls, product dispatches, approvals, release deliveries or production namespace changes.

## Implementation and source boundaries

- [Converter](../../apps/chrome-extension/src/migration/mg03-convert.ts) reuses the actual saved-workflow and learned-profile validators. Reads only `saved_workflows_v1` and `learned_page_profiles_v1`. Saved Workflow declarations remain advisory; original fingerprints never become current bindings. Learned names, notes, use/auto-update controls, task/step metadata and history are preserved. Old-v1 missing `commands` is handled explicitly as in the legacy catalog reader.
- [Learned projection](../../apps/chrome-extension/src/migration/mg03-learned.ts) excludes historical page identity hashes, context/target guards, command identities and receipts from the target projection. Procedure operations remain hints requiring fresh review; no value/ref/session/approval authority is imported. A disabled catalog/profile/recipe is never auto-enabled.
- [Staging](../../apps/chrome-extension/src/migration/mg03-staging.ts) reads a cloned bounded snapshot, binds its canonical digest to the migration ID/epoch, rechecks source stability and the trusted freeze guard, and atomically stores the browser-local original snapshot, advisory records, quarantine reasons and checkpoint in IndexedDB `migrationJournal`. It uses the existing profile-specific Codebase database; backups are not graph entities or query datasets. It never writes original Chrome storage keys.
- Retry of the same migration ID requires matching source/target digests, epoch and readback; staging corruption/conflicts fail closed. A quota exception aborts the whole transaction; retry does not duplicate records. Checkpoints have the S36 coordinator's shape and include source count, copied/quarantined counts and digests.

Malformed/unsupported containers are retained as one quarantined container with source index -1. Supported containers count every source record; invalid records, unsupported steps and duplicate IDs receive explicit indexed quarantine reasons. All originals, including invalid records, remain in the local snapshot. No silent salvage/drop path is used. Snapshots over 4 MiB are rejected before persistence; per-container limits are 100 records. Original snapshots may contain private local content and are never included in logs/reports or transported to backend/model APIs. The browser identity-key storage key is neither requested nor copied.

`Mg03Source.assertFrozen` is a trusted integration port, not a client claim. The actual production admission/writer fence is **not wired** in this slice. All writers must remain frozen for the entire operation; two digest reads alone cannot provide cross-store atomicity. Epoch revocation may leave inspection-only staging but cannot authorize its use. The implementation rechecks the guard after persistence before returning a successful checkpoint. Actual release composition must also bind backend/extension acknowledgments to the same epoch/manifest. This code neither acknowledges nor activates a runtime.

## Executed checks

| Check | Result and scope |
| --- | --- |
| `pnpm typecheck` | PASS after test-module import correction |
| `pnpm lint` | PASS, ESLint and Prettier |
| `pnpm test:s36` | PASS, 16/16 across three files: prior coordinator 6, converters 4, staging 6 |
| `pnpm test:unit` | PASS, 1,269/1,269 across 258 files |
| `pnpm test:fixture` / `pnpm test:e2e` | PASS, 1/1 each |
| `pnpm check:module-boundaries` | PASS, 423 extension modules; MG03 browser bundle imports checked separately |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS, development package; version unchanged |
| `CHROME_FOR_TESTING_BIN=... pnpm test:chrome-s36:mg03` | PASS, six controlled real-Chrome IndexedDB checks |
| `pnpm check:s36:mg03` | PASS, cumulative inventory, frozen production/design, new source-size and browser import boundary |
| `git diff --check` | PASS |

First failure: TypeScript TS1479 rejected a static ESM `fake-indexeddb` import from the CommonJS test context. The tests now use the existing repository convention of dynamic imports. Typecheck and the affected suite then passed. Quota, invalid-record, stale-epoch, source-drift and corruption outcomes are deliberate negative checks, not runtime successes.

The [Chrome fixture](../../extension/tests/fixture/s36/mg03-chrome-cases.ts) bundles the actual converter/staging code and runs against real IndexedDB in a temporary loopback page/profile. It verifies counts, close/reopen/readback, idempotent retry, source preservation, advisory authority and revoked-epoch rejection. [Report](s36-mg03-chrome-2026-10-24/report.json) records revision/dirty caveat and browser version. Source storage and the freeze port are controlled objects, **not installed-extension Chrome storage or an actual legacy writer fence**. Six assertions on one synthetic saved Workflow do not qualify all legacy records or full migration.

## Remaining acceptance

MG03 source conversion and per-unit persistence are now implemented and checked in the bounded scope above. Signed Profile/resolver imports remain the separate S35 verifier path and are not automatically re-signed/trusted by MG03. Actual source snapshot/freeze integration, protected local-backup retention/cleanup, settings/secrets (MG01), permissions (MG02), history (MG04), active execution (MG05), diagnostics (MG06), extension/backend acknowledgment delivery and full fault matrix remain incomplete.

S36 UI continuity, 100 Ask/100 Action holdouts, prior live prerequisites and supported-OS installer/release qualification remain pending. S37 stays Planned. No old source, writer, permission, transport or execution loop is retired here. The original external Platform backlog dated 2026-09-06 remains unresolved and outside this Browser-local scope.
