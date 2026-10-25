# Controlled Linux release-set transitions

The isolated S36 installation library supports an explicit forward or reverse switch between two independently pinned, intact artifact sets. This changes the owned native-host wrapper and installation receipt while preserving pairing, extension/registry identity and all user/runtime data. It is controlled installation tooling, not migration admission, production cutover or proof of cross-version runtime/data compatibility.

Build with `pnpm build:s36:release` and `pnpm build:s36:install`, then run under the exact Node/Linux environment recorded in both artifact manifests. First follow [release integrity](migration-release-integrity.md) and [Linux installation](migration-linux-install.md). Both immutable sets must remain available and verify; keep their expected IDs outside those directories.

```js
import { transitionRelease } from "./dist/s36/installation.mjs";

const from = { directory, registry, extensionId,
  releaseDirectory: reviewedOldDirectory, releaseId: reviewedOldId };
const to = { ...from,
  releaseDirectory: reviewedTargetDirectory, releaseId: reviewedTargetId };

transitionRelease(from, to);
// After stopping the target daemon, an explicit reverse switch uses the same API:
transitionRelease(to, from);
```

Stop the owning daemon first. The existing installation lock and socket gate apply. Source and target must have distinct directories and IDs, identical installation directory/registry/extension identity, and no overlap with installation or registry directories. `installRelease` continues to reject an implicit identity/release change; this separate API requires both caller-selected identities.

The current receipt must be installed with both owned files intact; repair missing files before starting a new switch. Pairing bytes/digest, selected Node executable and planned file hashes must match. The tool verifies both release trees before modifying installation state. The existing verifier rejects protocol, Node/architecture/version skew against its recorded/current contract; it does not prove application/schema compatibility merely because two versions pass integrity checks. A production caller still needs the full S36 release/runtime compatibility and installation gates.

Before replacing any owned files, the tool persists `transition.json` with strict source and target receipts. While it exists, ordinary install/repair/unregister refuse to proceed. Retry exactly `transitionRelease(from, to)` to recover; do not reverse the arguments or substitute another target for a pending operation. File states may match only the recorded source/target hashes; changed pairing, foreign data or another transition journal blocks recovery. After writing target files and the final receipt, the tool fsyncs removal of the transition journal. Retrying an already completed switch is idempotent.

No atomic transaction spans the registry and installation directories. During an interrupted switch the source receipt may coexist with a target wrapper, so the daemon must stay stopped until recovery completes. The installer lock coordinates these operations only; external service managers are not integrated and must not auto-start the daemon during a switch. Source/target artifact damage can prevent recovery; restore the independently verified artifacts and review stale locks/sockets rather than editing the journal or accepting new hashes. Exhaustive power-loss, arbitrary disk-failure and malicious same-user-writer qualification remain outside this slice.

Controlled tests:

```sh
pnpm build:s36:integration
pnpm build:s36:release
pnpm build:s36:install
node --test scripts/s36/install/*.test.mjs scripts/s36/release/*.test.mjs scripts/s36/integration/*.test.mjs
pnpm check:s36:upgrade
```

For Chrome, set the normal `CHROME_FOR_TESTING_BIN`, source `S36_INSTALL_RELEASE_DIR`/`S36_INSTALL_RELEASE_ID`, target `S36_UPGRADE_RELEASE_DIR`/`S36_UPGRADE_RELEASE_ID`, and a fresh `S36_INSTALL_EVIDENCE_DIR`. Run `pnpm test:chrome-s36:upgrade` under Node 22.23.2. The wrapper requires both target inputs and cannot silently run only the older install smoke.

The [dated run](evidence/s36-linux-upgrade-2026-10-25.md) uses two real executable S28 bridge sets with the same versions/protocol; the target differs only by an appended fixture comment. A separate synthetic native fixture changes version metadata to exercise the generic switch protocol. Neither proves cross-version production behavior. Normal-profile deployment, service management, OS secret persistence, Windows/macOS, incompatible-schema migration and the complete target-runtime release remain unverified.
