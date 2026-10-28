# S36 observed migration owner — 2026-10-28

**In Progress.** Parent `18eb54d11832ade3fede929a259baae6f03c4140` plus this
uncommitted continuation; extension version 0.1.117. This extends the
[storage event watcher](s36-source-watch-2026-10-28.md).

The opt-in [owner adapter](../../apps/chrome-extension/src/migration/observed-owner.ts)
arms separate local and session watchers for the currently defined MG01–MG06
source keys. It checks both watchers and the underlying owner before and after
source digest, staging, validation, drain, ACK and ACK verification operations.
It also returns the watched local source for the existing settings/consensus
client. Initialization fails closed and releases already registered listeners;
disposal invalidates both sources. The caller must establish writer freeze and
drain before arming the observer.

When a delivered watched event occurs during an operation, its result is rejected.
The delegated operation may already have persisted staging or browser ACK metadata;
such metadata does not authorize backend agreement or dispatch, and requires fresh
source/target and ownership checks. Other keys and areas do not invalidate this
observer. Change values are not stored or logged.

This adapter does **not** block writers, guarantee synchronous event delivery,
observe before arming, persist its listener across restart, or itself establish
freeze/drain. It is connected explicitly in the controlled installed Chrome
qualification fixture, not selected by the normal product entrypoint or the
installed coordinator at startup. A new owner after restart must establish fresh
ownership and re-arm observation. Global commit remains unimplemented.

The S36 unit selection passes **26 files / 139 tests**, including five focused
owner-adapter cases. TypeScript, ESLint/Prettier, module boundaries,
`git diff --check` and `check:s36:settings-transfer` pass. The latter checks
1,932 inventoried files / 231 modules, previous mappings, source size and frozen
production/design hashes.

Verification uses the previously pinned qualification artifact set
`d85cf252b62b4c7362593cfc91e46e80c46b96eb45d2a66c45db0c0a64850db5`, Node 22.23.2
and Chrome 147.0.7727.15 on Linux. The actual isolated Chrome fixture first
establishes the existing validated/ACK state with controlled freeze, then creates
the observed owner and validates the current journal. A real local settings change
and restoration produces a storage event; a subsequent validation rejects with
`MIGRATION_SOURCE_CHANGED` before another consensus RPC is sent. The fixture
disposes listeners and restores the settings inside its temporary profile. No source
values are returned in the report. The daemon remains in the legacy namespace with
closed admission and no global commit. The local report
`dist/s36/observed-owner-20261028-final/report.json` records
`observedOwnerChangeRejected:true`, zero CSP violations, provider calls, business
dispatches and approvals.

Unit regression covers each current local/session source key, unrelated areas,
changed-then-restored invalidation, events during source reads and ACK production,
epoch/scope rejection, fence loss, disposal and partial listener-registration
failure. The pre-existing browser ACK may remain as historical metadata when a
change arrives during its creation; it is not forwarded by the adapter.

Actual writer freeze/drain, installed startup composition, complete cross-context
writer coverage, browser/Worker restart ownership, lost session-source recovery,
global commit and full OS/UI/live/holdout/release acceptance remain open. S36 stays
In Progress and S37 Planned; production routing and version are unchanged.
