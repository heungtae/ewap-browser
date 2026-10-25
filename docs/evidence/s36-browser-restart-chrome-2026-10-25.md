# S36 actual browser-process restart — 2026-10-25

Parent `e5b926d2a4ae1ddc80d49c10014250fa94732990` plus this dirty qualification slice.
Extension 0.1.117; S36 In Progress, S37 Planned.

## Observed restart boundary

The runner stages all six units through the existing installed path, saves a real
browser ACK candidate and retains only its manifest/checkpoint metadata in the
trusted test process. It then terminates Chrome, waits for exit and launches a
new Chrome process with the same on-disk profile and unpacked extension. It checks
a different PID and the same extension identity. This is not an IndexedDB connection
reopen, page reload, synthetic lifecycle event or simulated browser restart.

[Session-only report](s36-browser-restart-session-chrome-2026-10-25/report.json)
and [OS report](s36-browser-restart-os-chrome-2026-10-25/report.json) both PASS:

- Pairing, chat/request/diagnostic source keys are absent from storage.session.
- Local MG01/MG02/MG03 source digests still match the candidate manifest; MG04/MG05/
  MG06 session-source digests differ, checked individually in the new process.
- The actual IndexedDB browser ACK still exists and its manifest/checkpoint digest
  matches the retained candidate. Rejection is not explained by a missing ACK.
- After explicit fresh trusted fixture pairing, the existing browser owner rejects
  that candidate specifically with `MIGRATION_ACK_STAGING`. A transport failure is
  not accepted as evidence of source-loss rejection.
- MG01 and policy readback still validate through the installed native host. The
  daemon stays running throughout browser restart, including in Session-only mode;
  this does not claim that volatile backend credentials survive daemon restart.
- Pairing file bytes remain unchanged, CSP violations are zero, backend remains
  prepared/legacy with admission closed, and no global commit occurs.

Lost session sources and historical pairing/grants are not rehydrated from the
saved candidate. Its hashes/counts are observation metadata, not execution or
approval authority. No new source is seeded after restart and no hidden stage/
mirror write repairs the missing source. Fresh pairing is an explicit trusted
qualification action, not production automatic recovery.

## Verification and artifacts

Node 22.23.2, pnpm 9.15.4, actual headless Chrome 147.0.7727.15 on Linux. OS mode
uses the existing private D-Bus/GNOME Keyring fixture; no user keyring is accessed.
Each run verifies the unchanged actual runtime artifact ID
`3d65a6ab5e8d189f296bed497997613206efcf8fadbc9800e9a19d665460b663`
against the [original manifest](s36-installed-start-artifacts-2026-10-25/release-set.json)
and [report](s36-installed-start-artifacts-2026-10-25/report.json). Original artifact
source provenance is preserved; this slice adds qualification code, not runtime/UI.

With Chrome/release/independently pinned ID variables and a fresh evidence directory:

```sh
pnpm test:chrome-s36:browser-restart
pnpm test:chrome-s36:browser-restart:os
```

Both real-process restart scenarios PASS. The unchanged six-unit flow also passes
as a [separate regression](s36-browser-restart-owner-regression-chrome-2026-10-25/report.json).
S36 unit checks: 110/110 across 22 files. `pnpm typecheck`, `pnpm lint`,
`pnpm check:module-boundaries`, `pnpm check:s36:settings-transfer` and
`git diff --check` pass. Parent inventory mappings and original production/design
hashes are preserved. No product build/version bump or release delivery occurred.

An early harness attempted candidate validation before fresh pairing. Tightening
the assertion to the exact source-staging error exposed that ordering error. The
runner now pairs explicitly before validating the saved ACK and independently
checks each source digest; initial broad rejection is not counted as acceptance.

## Remaining acceptance

The missing session source correctly prevents continuing the candidate. Source
retention/explicit recovery UX, migration resumption after full process restart,
actual writer freeze/drain/restart ownership, installed backend/global checkpoint
publication and both-owner consensus/commit remain pending. No normal-user managed
service/deployment, cross-version compatibility, crash-stale ownership recovery,
full UI/history continuity, live JEV/holdout or Windows/macOS qualification is
implied. No provider/business call, approval, enabled provider/policy, task admission
or production cutover occurred. This is bounded negative cold-resume qualification,
not successful six-unit migration recovery.
