# ISS-20261031-001: Bridge replay advances past an unapplied snapshot

Status: **검증 중**. Discovered 2026-10-31 during S28 review, source base `8f43e0979`. This concerns the isolated target `BridgeClient`; production usage was not established. No user data or live request was involved.

When replay reported `resync`, the client advanced its cursor to the server cursor and marked itself available although it did not apply a snapshot. A later request could skip missing events. A gapped batch could also render an earlier event before rejecting the later gap.

The client now retains its cursor and remains unavailable while snapshot recovery is required. It validates the complete sequence and response cursor before rendering a batch. Snapshot application is not implemented, so this state remains blocked rather than inventing recovery. Changes do not grant execution authority.

Regression coverage is in `extension/tests/unit/migration/s28/settings.test.ts`: resync followed by ordinary replay does not skip or render events; a gapped batch renders nothing; existing deduplication and disconnect coverage remain. S28 tests and relevant boundaries are recorded in the Sprint evidence. Actual Worker/Panel restart, snapshot application, and product routing remain unverified. Keep this issue open until the required actual browser reconnect scope is verified.

On 2026-10-31, Linux/Node 20.19.6: `pnpm test:s28` passed 40 tests, including the real private Unix-socket checks; `pnpm build:s28`, `pnpm check:s28`, `pnpm typecheck`, ESLint and `git diff --check` passed. The S36 `presentation-recovery.test.ts` suite passed 7 tests. No browser execution or release was claimed.


On 2026-11-01, source base `068570503` plus this change, the actual target presentation can apply explicitly versioned **connection-only** snapshots. The server restricts this stream to connection events and supplies a fresh stream identity after process restart. The panel opts into this limited recovery and disables it permanently upon receiving any task-bearing event; generic clients still retain the unapplied-snapshot guard. [Chrome 147/Linux evidence](../../evidence/s28-connection-snapshot-2026-11-01.json) verifies visible daemon disconnect/reconnect and unchanged message counts after the new snapshot. Unit coverage in `extension/tests/unit/migration/s28/connection-snapshot.test.ts` checks restart/retention, task-history isolation and invalid snapshot revisions. This does not implement `BridgeClient` task snapshot application or durable task reconnect; the issue remains **검증 중** for that original acceptance scope.
