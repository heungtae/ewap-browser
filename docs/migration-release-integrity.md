# Migration release artifact integrity

This S36 tool pins an isolated S28 browser/backend artifact set and dependency manifests for controlled qualification. It does not package the complete target runtime, install a native host, open admission or certify a rollback release. Current product routing remains in the legacy extension.

Use pnpm 9.15.4 and Node 22.23.2 on Linux. Keep the independently reviewed expected release ID outside the mutable artifact directory. A manifest and files edited together are rejected only when the caller retains the original expected ID. Hashes establish integrity, not publisher identity or compatibility with all runtime/data schemas.

```sh
pnpm build:s28
pnpm build:s36:release
node scripts/s36/release/capture.mjs dist/s36/my-qualification-set
```

The destination must be fresh. Capture copies only the isolated extension/backend artifacts, root lock/workspace manifests and app/package manifests. It writes `release-set.json`, verifies all component files, then reports the expected ID. It does not copy pairing/configuration credentials, register Chrome or overwrite an earlier set. A failed capture can leave an incomplete directory; preserve it for diagnosis and choose a fresh destination for retry.

The manifest records source revision plus dirty status, extension/backend/browser app versions, protocol major/minor, exact verifier Node version, minimum Node major, Linux architecture, explicit session-only credential mode and every component file's SHA-256/size. App versions remain `0.0.0`; they are recorded honestly rather than inferred from the extension version. Dirty source is not a reproducible release reference.

To verify again after restart or immediately before a controlled rollback:

```js
import {
  verifyReleaseSet,
  releaseIntegrityPredicate,
} from "./dist/s36/release-set.mjs";

verifyReleaseSet(directory, independentlyPinnedId);
const integrity = releaseIntegrityPredicate(directory, independentlyPinnedId);
```

The predicate matches the requested ID and rereads the entire artifact tree on every call. It rejects missing/extra/modified files, invalid manifests, symlinked components/files, changed lockfiles, unsupported OS/architecture/Node or version/protocol mismatch. File/count/byte/depth limits bound traversal. Run against a trusted, quiescent local directory: this is not an atomic filesystem snapshot or a sandbox for concurrent hostile writers.

`ComposedMigrationPort` accepts a compatibility predicate. The controlled native rollback test uses this integrity predicate with synthetic prior artifacts and the actual six converters. A production caller must additionally establish actual prior runtime/data compatibility, authenticated installation/profile ownership and the complete S36 acceptance evidence. Never use integrity alone to authorize production cutover or namespace activation. The existing qualification namespace always keeps admission at zero.

Verification commands (build both bundles first):

```sh
pnpm build:s36:integration
pnpm build:s36:release
node --test scripts/s36/release/*.test.mjs scripts/s36/integration/*.test.mjs
pnpm test:s36
pnpm check:s36:release
```

See [dated evidence](evidence/s36-release-integrity-2026-10-25.md) for what actually ran. OS keychain persistence, clean install/upgrade/repair/uninstall, native-host registration, UI continuity, live qualification, holdouts and delivery remain separate gates.
