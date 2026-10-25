# S36 installed MG01/MG02 joint readback — 2026-10-25

Parent `17cd7d389f0773f38f00209dca46c563513f6038` plus this dirty qualification slice.
Extension 0.1.117; S36 In Progress, S37 Planned.

## Scope

Actual Chrome 147.0.7727.15 now stages MG01 settings and MG02 policy using the same
installed daemon, native registration, profile, migration ID and epoch. The
controlled prepared manifest binds separate observed source digests for the two
units. MG01 uses actual Chrome local storage and the authenticated settings client;
MG02 uses actual Chrome local storage, IndexedDB staging/local acknowledgment and
the authenticated policy mirror into SQLite. The settings and policy paths share
the installed daemon, not an in-memory mirror or a second backend process.

[Session-only report](s36-installed-joint-session-chrome-2026-10-25/report.json):
both units initially validate; daemon restart loses volatile MG01 credential
material, requiring explicit guarded reimport with the same checkpoint. The
persisted MG02 local/remote mirror still validates without restaging.
[OS report](s36-installed-joint-os-chrome-2026-10-25/report.json): actual private
GNOME Keyring 50.0 credentials and SQLite/IndexedDB policy acknowledgments validate
after daemon restart without another settings stage or policy mirror write.

Wrong MG02 epoch and changed source preferences are rejected before any policy
request is sent. The fixture restores its controlled source after the negative
case and validates the original mirror again. After shutdown the SQLite policy row
must retain migration ID `wire`, epoch 1 and the same backend owner profile guard.
Settings retain one published row, no fixture secrets in SQL metadata, admission
closed, CSP violations 0 and source-guard revocation blocking settings transfer.

[MG01-only regression](s36-installed-joint-mg01-regression-chrome-2026-10-25/report.json)
passes separately with joint flags false. No runtime/product/UI or default-store
change was introduced; new code is qualification fixture/runner composition only.

## Artifact and verification

Node 22.23.2, pnpm 9.15.4 and actual headless Chrome 147.0.7727.15 on Linux.
The unchanged actual package is pinned by
[manifest](s36-installed-start-artifacts-2026-10-25/release-set.json) and
[report](s36-installed-start-artifacts-2026-10-25/report.json), release ID
`3d65a6ab5e8d189f296bed497997613206efcf8fadbc9800e9a19d665460b663`.
Its original source provenance remains as recorded; each Chrome run verifies the
same independently pinned artifact before creating its temporary profile/install.

With the existing Chrome/release/pinned-ID environment variables and a fresh
`S36_INSTALL_EVIDENCE_DIR` per run:

```sh
pnpm test:chrome-s36:installed-joint
pnpm test:chrome-s36:installed-joint:os
pnpm test:chrome-s36:installed-settings
```

All three Chrome scenarios pass. OS mode uses the existing private D-Bus/keyring
wrapper and cleans up its owned keyring; no user keyring/provider account is used.
Affected settings RPC/MG02 conversion/staging/policy unit checks: 23/23 across four
files. `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`,
`pnpm check:s36:settings-transfer` and `git diff --check` pass. The cumulative
inventory preserves every previous mapping and original production/design hashes.

The first fixture bundle attempt failed before runtime execution because its unit
support import used one extra parent directory. The path was corrected; no policy
or runtime gate was weakened to obtain passing results.

## Remaining acceptance

Only MG01/MG02 are jointly exercised. MG03–MG06 installed ownership, global
coordinator acknowledgments/commit, actual writer freeze/drain/restart ownership,
full UI/history continuity, normal-user services/retention and real cross-version
compatibility remain open. The prepared state/freeze are controlled assertions,
not proof that actual legacy writers are stopped. No live JEV/business holdout,
approval, active policy installation, enabled provider, admission opening or
production cutover occurred. S36/S37 completion is not established.
