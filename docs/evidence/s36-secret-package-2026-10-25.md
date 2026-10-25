# S36 optional Linux secret package — 2026-10-25

Parent revision: `4ad10416336c45aa3c65a01dbd887afa00f78fba` plus this dirty slice.
S36 remains In Progress; S37 remains Planned. Extension version remains 0.1.117.

## Verified scope

The explicit `--linux-secrets` release capture includes the built Linux Secret
Service adapter and Python helper under the agent-server root. Both are covered
by the independently pinned release ID. Release verification rejects a partial
pair, changed/missing bytes, symlinks (existing tree rule), group/world write
permissions and owners other than root/current user. Safe modes are checked
again during verification; permissions are not merely assumed from file hashes.
The adapter's existing runtime helper checks and OS probe still apply.

[Captured artifact report](s36-secret-package-artifacts-2026-10-25/report.json)
and [manifest](s36-secret-package-artifacts-2026-10-25/release-set.json) record
36 files, 2,759,021 bytes and release ID
`c8647c8e7b14e65d93105e86f8f093f53a5cb5b917e638d996e4153fc4649a22`.
This actual build was captured and verified, not registered or delivered.

Separately, the sixth private OS test adds the actual built adapter/helper to a
synthetic release fixture, pins/verifies it, registers through the actual isolated
installer in temporary directories, dynamically imports that packaged adapter,
and writes/reads through its packaged helper on a private GNOME keyring. Removing
registration leaves the credential readable. This proves explicit retention after
unregister, not a normal-user install, automatic store selection or purge UI.
No real desktop keyring is used. The synthetic installer fixture is distinct from
the captured actual artifact set above.

## Checks

- `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`.
- `pnpm build:s28`, `pnpm build:s36:release`, `pnpm build:s36:secrets`, `pnpm build:s36:install`.
- Node 22.23.2 release/install Node tests: [21/21](s36-secret-package-artifacts-2026-10-25/native-tests.tap).
- Node 22.23.2 isolated GNOME Keyring 50.0 checks: [6/6](s36-secret-package-os-2026-10-25/report.json), [TAP](s36-secret-package-os-2026-10-25/tests.tap).
- `pnpm check:s36:settings-transfer`: cumulative inventory, module size, browser/backend boundary and frozen production/design hashes.
- `git diff --check`.

The first cumulative inventory check rejected newly retained evidence as unmapped.
The new inventory extends the previous settings-transfer baseline without changing
its mappings; the check now validates that inheritance. This failure was an
inventory bookkeeping gap, not OS/runtime qualification.

## Remaining limits

The normal bridge/default credential mode remains Session-only. Optional packaging
does not select a store or start a migration daemon. Python/PyGObject/libsecret,
a running Secret Service and an unlocked persistent collection are external host
prerequisites. Real desktop installation/upgrade/service ownership, store selection
and retention/removal operations, Windows/macOS, actual legacy-writer freeze/drain,
installed six-owner orchestration, M00 parity, live JEV and full holdouts remain
pending. No Chrome run was repeated for this packaging-only slice. No production
routing, UI template, admission or original architecture/Sprint design changed.
