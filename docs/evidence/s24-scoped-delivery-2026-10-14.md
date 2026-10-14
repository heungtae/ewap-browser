# S24 scoped commit verification — 2026-10-14

The commit candidate includes learned-profile storage and Ask/Act integration,
the separate profile management window, window-bound Panel recovery, and their
tests and evidence. Unrelated Provider/plugin cleanup, manual collection retirement,
page-collection progress/provenance, S22/S23 evidence and S25 planning remain in
the original working tree. Shared files are staged by change rather than whole file.

The candidate was materialized from base
`a1f111fcb9b2f402e9ef6790728225120270ae3c` plus the selected changes in an isolated
temporary directory. Validation therefore does not depend on the excluded changes.
Linux, Node 20.19.6, pinned pnpm 9.15.4, Chrome for Testing 147.0.7727.15,
extension 0.1.109. No additional version bump was performed.

Executed against this candidate:

- `pnpm typecheck`, `pnpm lint`: PASS.
- Related learned-profile, Settings, Panel and sender/transport/request suites:
  26 files, 96 tests PASS. The earlier mixed-working-tree run's extra activity-log
  tests belong to the excluded page-collection changes.
- Version-preserving TypeScript compile and extension bundle: PASS.
- `node scripts/release-smoke.mjs`: package policy, manifest and required assets PASS.
- `node scripts/check-module-boundaries.mjs`: 379 modules PASS.
- `pnpm test:chrome-s24`: [controlled Ask/manager receipts](s24-scoped-delivery-ask-2026-10-14.json), PASS.
- `pnpm test:chrome-s24-act`: [controlled Act receipts](s24-scoped-delivery-act-2026-10-14.json), PASS.
- Relative Markdown links in the selected documents resolve. A credential-pattern
  scan of the selected source/evidence found no provider tokens or private keys.

Built Worker SHA-256:
`20560b45fa4398271035ab0347f2b82110674139505a9c534eabd0e610287762`.

The [management UI evidence](s24-profile-manager-2026-10-14.md) and
[ISS-20261014-001](../issues/records/2026-10-14-profile-window-chat-recovery.md)
retain the initial failure and correction history. The candidate uses the same
manager UI and checks while preserving the pre-existing manual controls and
Provider configuration paths outside S24's scope.

This is local source/package and controlled Chrome verification. No live Provider,
production site, Windows, user-install upgrade, public release or Platform
integration is qualified. The existing source-size failures remain outside this
delivery scope. Historical evidence retains the exact earlier working-tree scope.
