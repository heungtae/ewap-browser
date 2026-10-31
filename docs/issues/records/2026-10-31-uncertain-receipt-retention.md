# ISS-20261031-004: Retention removed unsettled dispatch receipts

Status: **검증 중**. Discovered 2026-10-31 while preparing S28 task-history recovery, source base `a36926c9c`. The isolated S31 retention job removed all non-null receipts after terminal retention, including uncertain or mismatched receipts. Subsequent history projection could therefore lose evidence that an effect was unresolved. No production task or external effect was involved in the reproduction.

Retention and history now use the same fail-closed receipt classifier. Missing, malformed, mismatched, reserved, unknown and dispatched-but-not-verified receipts remain uncertain and are not deleted. Only receipts that are definitively not dispatched or dispatched with passed verification are eligible for existing retention cleanup. This does not authorize redispatch or establish goal completion.

The real SQLite regression in `scripts/s31/sqlite.test.mjs` checks null, malformed, failed-verification and mismatched receipts survive cleanup and remain unknown; a bound passed receipt can be removed after the retention threshold. End-to-end browser receipt reconciliation and installed runtime behavior remain unverified.

On 2026-10-31 Linux, Node 22.23.2 real SQLite tests passed 10/10; `pnpm build:s31`, `pnpm test:s31` (5/5), `pnpm check:s31`, `pnpm check:s28`, typecheck and ESLint passed. A passed verification requires an evidence digest; a mismatched call, step or prepared digest is retained as uncertain. No browser or external dispatch was performed.

After commit `0036a288f`, the full unit suite passed 1,411 tests in 285 files on Node 20.19.6. Typecheck and the 423-file module-boundary check also passed. These checks do not qualify installed browser reconciliation.
