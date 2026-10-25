# ISS-20261025-003: Resume prepare returns historical state after source loss

## Tracking

- Status: Resolved for the composed migration-session preflight; installed deployment unverified.
- Occurrence/update: 2026-10-25 KST.
- Parent: `e5b926d2a4ae1ddc80d49c10014250fa94732990`, extension 0.1.117.
- Fix: current uncommitted continuation; no deployment/version change.
- Related: actual [browser restart qualification](../../evidence/s36-browser-restart-chrome-2026-10-25.md).
  Earlier install/daemon issue IDs address different lifecycle causes.

## Reproduction and cause

Prepare/copy a six-unit migration to validated, remove a session source and call
`MigrationSession.prepare` again with the same identity. It checked the profile,
input identity and fence but returned the stored validated journal without rereading
source digests. The [pre-fix TAP](../../evidence/s36-resume-preflight-native-2026-10-25/before-fix.tap)
records `Missing expected rejection`. Later copy/ack/commit checks already blocked
activation; this issue is the misleading early resume result, not evidence of an
unauthorized commit or lost mutation protection.

## Fix

For prepared/copying/validated journals, resume reads every unit's current source
digest through the existing frozen port and compares it with the preserved manifest.
It then rechecks the fence and journal revision/epoch before returning a result.
Source drift/loss throws `SOURCE_CHANGED`, fence loss remains `MIGRATION_FENCE` and
concurrent journal progress rejects with `MIGRATION_CAS`. The preflight does not
copy, repair, reseed, update ACKs, advance a fence or select a namespace. Existing
checkpoint/ACK evidence remains intact. A caller must provide explicit recovery
of the original bound source, not infer completion from a saved result.

Committed/rolled-back journal observation preserves existing terminal semantics;
this does not rerun copy or grant new activation. Prepare remains a source preflight,
not target secret/readback or readiness qualification: later copy/ack/commit checks
remain required. Trusted freeze ports and installed ownership are still prerequisites.

## Acceptance and evidence

- Lost chat session and drift in each of MG01/MG02/MG03/MG05/MG06 reject resumed
  validated prepare, with unchanged journal/checkpoints/ACKs/fence. PASS.
- Prepared and copying resumes reject source loss without advancing state. PASS.
- Fence or journal revision changes during the final observation reject rather
  than returning a result from the earlier revision. PASS.
- Terminal observation does not recopy after post-completion source edits; explicit
  rollback remains bounded and preserves cancellation counts. PASS.
- Existing restart/readback, lost ACK response, final-write recovery, missing mirror,
  expiry/source commit rejection and rollback integration regressions pass.

Actual SQLite plus controlled fake IndexedDB/source ports under Node 22.23.2:
[19/19 TAP](../../evidence/s36-resume-preflight-native-2026-10-25/tests.tap).
[Dated evidence](../../evidence/s36-resume-preflight-2026-10-25.md) records static
checks and boundaries. No new installed global orchestrator, live-provider call,
Chrome source freeze or production routing was introduced.

## History

- 2026-10-25: parent behavior reproduced; failing source-loss test retained.
- 2026-10-25: source/fence/revision resume checks implemented; bounded native
  regression acceptance passed. Full installed recovery/global consensus remains open.
