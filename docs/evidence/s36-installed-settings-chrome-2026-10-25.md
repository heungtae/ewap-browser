# S36 installed Chrome MG01 transfer — 2026-10-25

Parent `481d44899f7b6f2f2be2598c2fb5259dc05ca259` plus this dirty qualification slice.
Extension version 0.1.117; S36 In Progress, S37 Planned.

## Verified runtime path

Actual headless Chrome 147.0.7727.15 now exercises the explicitly installed daemon:
allowed extension page → actual Worker → authenticated native host registration →
packaged `migration-daemon.mjs --installed` → SQLite/MG01 and selected SecretStore.
Temporary registration uses the actual installer/receipt/wrapper. No test daemon
bundle serves the two installed-mode runs. The source is real Chrome local storage
containing synthetic provider values. A trusted controlled assertion and locally
seeded journal provide freeze/preparation; actual legacy-writer exclusion is not
qualified by this fixture. No provider or business call is made.

[Installed Session-only report](s36-installed-settings-session-chrome-2026-10-25/report.json):
stage and credential readback pass; real daemon restart loses Session-only material;
validation rejects; explicit fresh guarded stage restores the same checkpoint.
[Installed OS report](s36-installed-settings-os-chrome-2026-10-25/report.json):
actual private D-Bus/GNOME Keyring 50.0 stage/readback pass; real daemon restart
validates the retained checkpoint without a second stage. The OS wrapper refuses
a preexisting Secret Service owner, uses private XDG/keyring directories, and cleans
up its owned keyring. No user keyring is touched. Desktop display/portal/a11y
environment is disabled for the private headless wrapper.

Both installed runs verify zero CSP violations, unchanged source digest, revoked
source guard blocking, one published SQLite MG01 row, admission closed and absence
of fixture secret values in SQLite metadata. ACKs/reports contain no credentials.
Session loss/reimport and OS persistence are reported separately; OS mode does not
claim that volatile credentials were lost. No remote prepare/commit command is added.

The [controlled-daemon regression](s36-installed-settings-controlled-chrome-2026-10-25/report.json)
preserves the original Session-only qualification path. It explicitly records
`installedStartVerified: false`; temporary native registration by itself is not
proof of installed-daemon binding. Common setup was extracted to a bounded helper;
fixture source/readback logic uses an explicit selected mode with the old default.

## Artifact and commands

All three runs use the previously captured actual artifact set
[manifest](s36-installed-start-artifacts-2026-10-25/release-set.json),
[report](s36-installed-start-artifacts-2026-10-25/report.json), ID
`3d65a6ab5e8d189f296bed497997613206efcf8fadbc9800e9a19d665460b663`.
Its source provenance remains the earlier parent/dirty build recorded there; this
slice changes qualification scripts/fixtures only, not application runtime or UI.
The artifact is independently verified before each run. New test scripts are not
injected into the packaged product artifacts; the controlled fixture is evaluated
through CDP in the temporary extension page.

Use Node 22.23.2 with pnpm 9.15.4 and set `CHROME_FOR_TESTING_BIN`,
`S36_INSTALL_RELEASE_DIR`, independently pinned `S36_INSTALL_RELEASE_ID`, and a
fresh `S36_INSTALL_EVIDENCE_DIR` for each command:

```sh
pnpm test:chrome-s36:installed-settings
pnpm test:chrome-s36:installed-settings:os
pnpm test:chrome-s36:settings-transfer
```

The OS alias creates a private D-Bus session and invokes the isolated keyring
wrapper; it is Linux/GNOME qualification only. All three Chrome runs PASS.
Affected settings RPC unit checks: 4/4. `pnpm typecheck`, `pnpm lint`,
`pnpm check:module-boundaries`, `pnpm check:s36:settings-transfer` and
`git diff --check` pass. The cumulative inventory preserves every previous mapping.
No product build/version increment or new release delivery occurred in this slice.

## Remaining acceptance

Actual source/target writer freeze/drain/restart ownership, all-six installed owner
composition, complete settings/history/UI continuity, real released-version/schema
compatibility, normal-user service/deployment/retention operations and crash-stale
ownership recovery remain open. This is MG01 controlled qualification, not a full
migration or enabled-provider claim. No live JEV, business holdout, Windows/macOS,
production routing/admission change or cutover was performed. See
[remaining acceptance](../s36-remaining.md).
