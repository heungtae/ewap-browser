# ISS-20261031-001: Bridge replay advances past an unapplied snapshot

Status: **검증 중**. Discovered 2026-10-31 during S28 review, source base `8f43e0979`. This concerns the isolated target `BridgeClient`; production usage was not established. No user data or live request was involved.

When replay reported `resync`, the client advanced its cursor to the server cursor and marked itself available although it did not apply a snapshot. A later request could skip missing events. A gapped batch could also render an earlier event before rejecting the later gap.

The client now retains its cursor and remains unavailable while snapshot recovery is required. It validates the complete sequence and response cursor before rendering a batch. Snapshot application is not implemented, so this state remains blocked rather than inventing recovery. Changes do not grant execution authority.

Regression coverage is in `extension/tests/unit/migration/s28/settings.test.ts`: resync followed by ordinary replay does not skip or render events; a gapped batch renders nothing; existing deduplication and disconnect coverage remain. S28 tests and relevant boundaries are recorded in the Sprint evidence. Actual Worker/Panel restart, snapshot application, and product routing remain unverified. Keep this issue open until the required actual browser reconnect scope is verified.

On 2026-10-31, Linux/Node 20.19.6: `pnpm test:s28` passed 40 tests, including the real private Unix-socket checks; `pnpm build:s28`, `pnpm check:s28`, `pnpm typecheck`, ESLint and `git diff --check` passed. The S36 `presentation-recovery.test.ts` suite passed 7 tests. No browser execution or release was claimed.
