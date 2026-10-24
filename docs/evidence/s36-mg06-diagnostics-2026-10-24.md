# S36 MG06 diagnostics metadata — 2026-10-24

**In Progress.** Continuation of S36 C1/R01 and MG06 diagnostics ownership. S37 remains Planned; no production cutover or legacy retirement occurred.

Parent: `dd959249ff54a97896e83b81cbb4e1b128a7db03` plus uncommitted MG06 changes. Linux, pnpm 9.15.4, Node 20.19.6, controlled Chrome 147.0.7727.15. Product version remains 0.1.117. Zero provider calls, browser actions, approvals, production namespace switches and deliveries.

## Actual implementation

- [Converter](../../apps/chrome-extension/src/migration/mg06-convert.ts) reads the actual session-owned `execution_diagnostics_v1` format and reuses `validDiagnostic`. It projects enum/status fields, sequence/timestamps and hashed request/worker correlations. It excludes messages, completion payloads, elapsed details, raw IDs, source logging controls and raw traces. Historical record level never becomes logging configuration or trace consent.
- Invalid records, future timestamps, expired records and duplicate worker/sequence identities receive indexed reason-only dispositions. Unsupported containers are counted as one quarantined container; supported containers account for every record. Existing `off`/`basic` controls can be read without enabling debug/trace. Limits are 2,000 records and a 4 MiB source read. Original diagnostics stay untouched with the existing owner; no malformed record is copied as raw recovery data into the new store.
- [Source reader](../../apps/chrome-extension/src/migration/mg06-source.ts) requests only the diagnostic session key and computes an immutable source digest. Raw input exists temporarily for validation/hashing and is not persisted, printed, sent to a provider/backend, or exposed by the staging API.
- [Metadata staging](../../apps/chrome-extension/src/migration/mg06-staging.ts) atomically stores derived metadata, checkpoint and expiry under an MG06-specific IndexedDB journal key. It deliberately does **not** use the raw-snapshot-copying MG03–MG05 path. Retry checks source stability and frozen epoch without refreshing expiry. The batch expires at the earliest included record's original timestamp plus the legacy 30-minute retention interval, or earlier. Invalid/expired-record reason-only batches are bounded to 30 minutes from creation.
- On read/validation after expiry, metadata is replaced by a minimal expired-key tombstone. The same migration ID cannot revive or replace that expired checkpoint; validation returns false. This is lazy purge on access, not an installed background cleanup scheduler. Production retention/access/cleanup integration remains pending. A batch may expire earlier than newer sibling records; it never extends a source record's lifetime.
- [Persisted-row decoder](../../apps/chrome-extension/src/migration/mg06-persisted.ts) permits only the metadata schema. Unexpected raw-text fields cause a generic error instead of being returned by the reader. Checkpoint validation additionally compares current source identity, epoch, counts, original conversion time, digest and expiry.

## Explicit digest compatibility

The legacy Browser `digestCanonical` returns base64url SHA-256, while S36 coordinator source/target digest fields require 64 lowercase hex characters. Initial MG06 tests exposed this mismatch: five checks failed on digest shape/readback validation. The [encoding helper](../../apps/chrome-extension/src/migration/migration-digest.ts) now converts the same canonical SHA-256 bytes explicitly, with strict canonical round-trip validation. Its output matches Node crypto on a Unicode canonical input.

A later negative test exposed accepting an extended stored batch expiry through the metadata reader. The persisted decoder now binds the batch deadline to original per-record deadlines and verifies checkpoint counts/integrity; that test failed before the fix and passed afterward.

The [named legacy staging adapter](../../apps/chrome-extension/src/migration/coordinator-staging.ts) connects existing MG03/MG04/MG05 base64url checkpoints to coordinator hex checkpoints in both directions. Tests exercise the actual three staging classes. Their stored namespaces/digests and counts remain unchanged. MG06 already uses hex and must not be wrapped by this adapter. Wrong/noncanonical encodings fail rather than being guessed. This fixes the encoding seam; it does not register a production migration coordinator, acknowledge stores or grant cutover authority.

## Executed checks

| Command | Result |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS, ESLint and Prettier |
| `pnpm test:s36` | PASS, 53/53 across 12 files; 15 new conversion/staging/encoding checks |
| `pnpm test:unit` | PASS, 1,306/1,306 across 267 files |
| `pnpm test:fixture` / `pnpm test:e2e` | PASS, 1/1 each |
| `pnpm check:module-boundaries` | PASS, 423 extension modules |
| Version-preserving `tsc -p tsconfig.build.json`, `build-extension.mjs`, `validate-package.mjs` | PASS, development package; version unchanged |
| `CHROME_FOR_TESTING_BIN=... S36_MG06_EVIDENCE_DIR=docs/evidence/s36-mg06-chrome-2026-10-24 pnpm test:chrome-s36:mg06` | PASS, six controlled Chrome IndexedDB assertions |
| `pnpm check:s36:mg06` | PASS, cumulative inventory, source size, browser dependency boundaries and preserved production/design hashes |
| `git diff --check` | PASS |

[Unit checks](../../extension/tests/unit/migration/s36/mg06-staging.test.ts) cover canary non-copying, source preservation, close/reopen/retry, fixed expiry/tombstone/no revival, source drift (including idempotent retry), revoked freeze, stored-text injection and quota abort/retry. [Retention checks](../../extension/tests/unit/migration/s36/mg06-retention.test.ts) also reject stored expiry extension. [Encoding checks](../../extension/tests/unit/migration/s36/coordinator-staging.test.ts) cover all three earlier staging classes and wrong/noncanonical digest formats.

The [Chrome fixture](../../extension/tests/fixture/s36/mg06-chrome-cases.ts) uses actual MG06 code and real IndexedDB in a temporary loopback page/profile. [Report](s36-mg06-chrome-2026-10-24/report.json) records revision/dirty caveat and browser version. It verifies hex checkpoint shape, no raw canaries in the journal, reopen/retry/source preservation, expiry purge, rejected revival and revoked-epoch rejection. Storage/freeze/time are controlled ports; this does not qualify installed-extension storage, actual wall-clock scheduler/retention, UI or OS installations. All raw canaries are synthetic; the report contains booleans/counts only.

## Remaining acceptance

MG06 source writer freezing, production retention scheduling/access/cleanup and full coordinator/acknowledgment wiring remain pending. MG01 provider/secret and MG02 permission conversion are incomplete. Prior MG03/MG04/MG05 production freeze, inventory, lifecycle/CDP and presentation integration gates remain open. Full live prerequisites, 100 Ask/100 Action holdouts, UI continuity and compatible supported-OS release qualification remain unverified. Original cross-repository Platform backlog dated 2026-09-06 remains external and unresolved. No raw trace import, new logging consent, release candidate or delivery is claimed.
