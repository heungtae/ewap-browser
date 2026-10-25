# S36 installed migration-daemon binding — 2026-10-25

Parent `fc35f18cbd15d2cc13bbe137d51c9f5ec951b228` plus this dirty slice.
Extension 0.1.117; S36 In Progress and S37 Planned.

## Implemented scope

The explicit packaged daemon accepts an optional final `--installed` flag. Under
its existing process-lifetime installation lock, this mode requires the canonical
`pairing.json` path, an active installed receipt bound to that package's release
ID/directory, matching Node executable/pairing digest and a private canonical
registry directory. Pending transitions and installing/removing/uninstalled states
reject startup. The receipt must match the current installer-generated plan, and
both wrapper and registration must exist with the expected hashes/permissions.
The actual configuration must contain exactly the installed extension identity.
These checks precede OS-store probing, SQLite creation and socket publication.

This flag binds explicit startup to local installer bookkeeping. It does not make
receipts signatures or protect against a malicious same-user filesystem writer.
The existing explicit standalone qualification mode remains available without the
flag; no remote caller can choose startup mode. This is not a managed service or
a new product entrypoint, task-admission or migration prepare/commit authority.

## Executed verification

- `pnpm build:s36:secrets`: actual daemon bundle, fixture-import exclusion.
- Node 22.23.2 native installed-start/startup-stop/coordination/daemon/release/
  install/transport/settings tests: [44/44](s36-installed-start-artifacts-2026-10-25/native-tests.tap).
- New installed test uses the actual built native launcher in separately pinned
  synthetic release fixtures, actual temporary native registration and `host.sh`
  execution through a real child process/HMAC bridge. It observes status with
  admission closed, switches forward, rejects startup from the old package,
  authenticates through the updated wrapper, switches back and authenticates
  again. Pairing bytes and status/profile binding remain unchanged. Unregister
  rejects installed-mode startup. Packages have the same product/schema/protocol
  versions and deliberate fixture labels; no cross-version compatibility is claimed.
- Fourteen negative installation cases reject before SQLite/socket creation:
  absent receipt; installing/removing/uninstalled states; pending transition;
  changed pairing; missing/changed wrapper; missing/changed registration;
  executable skew; permissive registry; inconsistent plan digest; other config path.
  Owned startup locks are released and no receipt is created/repaired implicitly.
- Private GNOME Keyring 50.0 checks: [8/8 report](s36-installed-start-os-2026-10-25/report.json),
  [TAP](s36-installed-start-os-2026-10-25/tests.tap). The new installed OS-mode case
  authenticates via the actual registered native wrapper, stops, rejects startup
  when the private keyring is locked without Session fallback, then unlocks the
  private test keyring externally and authenticates again with the same status.
- `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`.
- `pnpm check:s36:settings-transfer`: cumulative unchanged-parent inventory,
  bounded module sizes, browser/backend purity and original production/design hashes.
- `git diff --check`.

[Actual artifact report](s36-installed-start-artifacts-2026-10-25/report.json) and
[manifest](s36-installed-start-artifacts-2026-10-25/release-set.json) pin 37 files,
3,607,498 bytes; ID
`3d65a6ab5e8d189f296bed497997613206efcf8fadbc9800e9a19d665460b663`.
That actual set was integrity-verified, not registered/delivered. The runtime tests
above use separately pinned fixtures containing actual launcher/daemon/helper builds.

## Limits

Full installed MG01–MG06 ownership, actual source/target writer freeze, managed
normal-user service/deployment, released-version/schema compatibility, retention
operations and crash-stale ownership recovery remain pending. Installed-mode
native status is not a business-task or credential-migration completion claim.
Existing MG01 staging/readback evidence remains separately bounded. Normal startup
and default Session-only behavior, original UI/production/designs and admission
remain preserved. No Chrome/live provider/holdout/Windows/macOS run occurred.
