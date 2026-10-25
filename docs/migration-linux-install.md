# Controlled Linux native-host installation

The S36 installation tool registers a content-pinned S28 bridge artifact set in an explicitly selected Linux Chrome native-host registry. It supports a fresh install, repair of missing owned files, interrupted-operation recovery and removal of the owned registration/launcher. It does not install the complete migration runtime or enable task admission. Product entrypoints and the user's existing Chrome installation remain unchanged by the test commands below.

Build with pnpm 9.15.4 and execute the tool under Node 22.23.2. First [capture and independently pin a release set](migration-release-integrity.md). The verifier rereads every release artifact before install or repair. Keep the artifact directory quiescent and retain its pinned ID outside that directory.

```sh
pnpm build:s36:release
pnpm build:s36:install
```

The built library exposes these operations:

```js
import { installRelease, uninstallRelease } from "./dist/s36/installation.mjs";

const input = {
  directory: "/absolute/private/agent",
  registry: "/absolute/isolated-chrome-profile/NativeMessagingHosts",
  releaseDirectory: "/absolute/qualification-artifact-set",
  releaseId: independentlyPinnedId,
  extensionId: verifiedUnpackedExtensionId,
};

installRelease(input);   // Also repairs missing owned files for exactly this identity.
uninstallRelease(input);
```

Directories must be absolute, normalized, owner-private and disjoint; existing parent directories must be canonical paths without symlink aliases. The agent socket path must fit the existing native-config contract (100 characters). The caller explicitly chooses the registry; the tool never discovers or silently modifies a normal Chrome profile. Linux native-host lookup varies by Chrome distribution: only the isolated Chrome environment in the [dated evidence](evidence/s36-linux-install-2026-10-25.md) was exercised.

Registration is `ai.contextpilot.agent`, uses stdio and allows only the provided extension origin. The protected host wrapper invokes the current Node executable and the pinned set's backend launcher. The caller starts the backend daemon separately with the protected `pairing.json`; the installer does not auto-start processes or provide a service manager. Pairing/installation identity and the selected executable are retained across repair and reinstall. Health remains `SESSION_ONLY`; no OS credential store is implied.

Every operation holds an exclusive installation lock. Any existing `agent.sock` blocks modification, including a stale socket; stop/reconcile the owning backend first. An installation lock left by process death also blocks changes. Investigate ownership before manually removing a stale lock; no timeout is treated as proof that another installer is dead.

The owner-only `installation.json` receipt binds the release ID/directory, registry, extension ID, executable and exact pairing/launcher/registration hashes. Foreign or changed files, altered pairing, unsafe permissions, symlinks and identity changes fail closed. This receipt is local ownership bookkeeping, not a signature or runtime authorization. The filesystem must be trusted against concurrent malicious writes; the lock coordinates these tool operations, not every same-user process.

An `installing` receipt lets retry recreate missing owned files. A `removing` receipt requires removal to finish before another install. File replacement uses temporary private files, fsync and rename; removal fsyncs the affected directories. No transaction spans the two directories. Interrupted power loss and every possible write failure have not been exhaustively qualified. Temporary files or stale locks can require explicit diagnosis.

Removal checks ownership even when release artifacts are damaged or gone. It deletes only the owned registration and host wrapper. Pairing, the receipt, user data, directories and release artifacts remain. Removal is idempotent; reinstalling the same identity preserves pairing. This is unregistering the host, not purging data or secrets. `installRelease` rejects different release IDs/paths. Use the explicit [two-set transition API](migration-linux-upgrade.md) for controlled forward/reverse selection; live cross-version compatibility remains unqualified.

Controlled checks:

```sh
pnpm build:s36:integration
pnpm build:s36:release
pnpm build:s36:install
node --test scripts/s36/install/*.test.mjs scripts/s36/release/*.test.mjs scripts/s36/integration/*.test.mjs
pnpm check:s36:install
```

The Chrome runner requires `CHROME_FOR_TESTING_BIN`, `S36_INSTALL_RELEASE_DIR` and an independently pinned `S36_INSTALL_RELEASE_ID`. Set `S36_INSTALL_EVIDENCE_DIR` to a new evidence directory when retaining a report. It creates a temporary profile, installs/repairs a native host, exercises the real authenticated S28 bridge and backend restart, unregisters the host and removes the temporary profile. It does not use live providers or run business actions. Windows/macOS, normal-profile deployment, system service management, OS credential persistence, full target-runtime installation and cross-version upgrade remain unverified.
