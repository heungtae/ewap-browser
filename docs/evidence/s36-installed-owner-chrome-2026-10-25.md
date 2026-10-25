# S36 installed six-unit browser-owner readback — 2026-10-25

Parent `17cd7d389f0773f38f00209dca46c563513f6038` plus the uncommitted MG01/MG02
joint and six-unit owner qualification slices. Extension 0.1.117; S36 In Progress,
S37 Planned. This does not establish global migration consensus or commit.

## Runtime scope

The [Session-only run](s36-installed-owner-session-chrome-2026-10-25/report.json)
and [OS run](s36-installed-owner-os-chrome-2026-10-25/report.json) use actual Chrome
147.0.7727.15 storage.local/storage.session, real profile-scoped IndexedDB, actual
installed native registration and the packaged daemon with `--installed`. The
MG01 checkpoint comes from real authenticated settings stage/readback; it is not
a fabricated target digest. MG02 is mirrored to real backend SQLite. Browser owner
composition stages MG03 saved workflow, MG04 historical chat, MG05 terminal request
archive and MG06 diagnostic metadata into actual IndexedDB, with a nonempty copied
checkpoint required for each staged unit. Sources are synthetic fixture data in
the actual browser stores; provider/business calls remain zero.

The observed per-unit source digests seed one controlled backend prepared manifest.
The real browser owner validates all six sources/checkpoints and saves its local
ACK candidate. After actual daemon restart, MG01 follows explicit Session-only
loss/reimport or persistent private OS readback as appropriate. MG02 mirror still
validates. Closing/reopening the owner's IndexedDB connection verifies all browser
staging and the saved browser ACK again. This is connection reopen, not browser
process restart or an installed full-history presentation check.

Missing MG06 and a different profile reject the browser ACK candidate. Advancing
the controlled diagnostics clock by 31 minutes invalidates acknowledgment through
the existing MG06 retention path. That final negative intentionally expires the
staged diagnostic metadata; it does not leave a globally validated migration.
Wrong policy epoch/source drift and revoked settings source guards still reject.
CSP violations are zero; source hashes remain unchanged before intentional target
expiry; no fixture credential appears in SQLite metadata.

## Global boundary

Only a browser ACK candidate uses a locally constructed validated view. The backend
journal remains `prepared`, stores/global acknowledgments are not advanced by this
fixture, namespace is `legacy` and admission remains closed. The runner checks the
backend phase/namespace after shutdown. No remote prepare/fence/commit command or
product activation was added. Source freeze assertions, idle/terminal-only drain
observations and the diagnostic clock are controlled ports; they do not stop actual
legacy/target writers or establish real cancellation/CDP reconciliation ownership.

## Checks and artifact

Node 22.23.2, pnpm 9.15.4, actual Chrome 147.0.7727.15 on Linux. The unchanged actual
runtime artifact set is independently verified before each run: ID
`3d65a6ab5e8d189f296bed497997613206efcf8fadbc9800e9a19d665460b663`,
[manifest](s36-installed-start-artifacts-2026-10-25/release-set.json),
[original artifact report](s36-installed-start-artifacts-2026-10-25/report.json).
Its source provenance remains the older captured build as recorded there; these
slices change qualification scripts/fixtures and evidence, not product runtime/UI.
OS mode creates/cleans its own private D-Bus and GNOME Keyring 50.0 fixture. It does
not access the user's desktop keyring.

With the existing Chrome/release/pinned-ID variables and a fresh evidence directory:

```sh
pnpm test:chrome-s36:installed-owner
pnpm test:chrome-s36:installed-owner:os
```

Both PASS. The separate [MG01/MG02 regression](s36-installed-owner-joint-regression-chrome-2026-10-25/report.json)
and [MG01-only regression](s36-installed-owner-mg01-regression-chrome-2026-10-25/report.json)
also PASS with six-unit flags false. Total four Chrome scenarios. Full S36 unit
checks: 110/110 across 22 files. `pnpm typecheck`, `pnpm lint`,
`pnpm check:module-boundaries`, `pnpm check:s36:settings-transfer` and
`git diff --check` pass. Previous inventory mappings and original production/design
hashes remain unchanged. No build/version increment or release delivery occurred.

## Remaining gates

Actual writer freeze/drain/restart ownership; backend global checkpoint publication,
both-owner acknowledgment and global commit through an installed orchestration;
real browser-process restart ownership; complete UI/history continuity; normal-user
service/deployment/retention operations; cross-version compatibility; crash-stale
ownership recovery; live JEV/holdouts and Windows/macOS remain open. No active
provider/policy/approval or production cutover follows from this bounded readback.
