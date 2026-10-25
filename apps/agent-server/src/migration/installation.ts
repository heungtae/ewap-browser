import { realpathSync } from "node:fs";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import { verifyReleaseSet } from "./release-set.js";
import {
  atomicPrivate,
  protectedFile,
  withInstallLock,
  assertStopped,
  durableRemove,
} from "./install-files.js";
import {
  assertInput,
  pairing,
  installationPlan,
  type InstallationInput,
} from "./install-plan.js";
import {
  ownedPaths,
  previousReceipt,
  assertOwned,
  save,
  prepare,
  summary,
  assertNoTransition,
} from "./install-state.js";
export function installRelease(input: InstallationInput) {
  // Verify before creating or touching installation state.
  assertInput(input);
  if (realpathSync(input.releaseDirectory) !== input.releaseDirectory)
    throw new Error("INSTALL_PATH");
  verifyReleaseSet(input.releaseDirectory, input.releaseId);
  prepare(input);
  return withInstallLock(input.directory, () => {
    assertStopped(input.directory);
    assertNoTransition(input);
    const previous = previousReceipt(input);
    if (previous?.state === "removing")
      throw new Error("INSTALL_REMOVAL_PENDING");
    assertOwned(input, previous);
    const plan = installationPlan(input, pairing(input));
    if (
      previous &&
      canonicalJson({ ...previous, state: "installing" }) !==
        canonicalJson(plan.receipt)
    )
      throw new Error("INSTALL_PLAN_CONFLICT");
    save(input, plan.receipt, "installing");
    const paths = ownedPaths(input);
    atomicPrivate(paths.launcher, plan.launcher, 0o700);
    atomicPrivate(paths.registration, plan.registration);
    save(input, plan.receipt, "installed");
    return summary(input, "installed");
  });
}
export function uninstallRelease(input: InstallationInput) {
  // Unregister even when the old artifact set is damaged; never delete that set.
  prepare(input);
  return withInstallLock(input.directory, () => {
    assertStopped(input.directory);
    assertNoTransition(input);
    const receipt = previousReceipt(input);
    if (!receipt) throw new Error("INSTALL_OWNERSHIP_MISSING");
    assertOwned(input, receipt);
    save(input, receipt, "removing");
    const paths = ownedPaths(input);
    for (const path of [paths.registration, paths.launcher])
      if (protectedFile(path) !== undefined) durableRemove(path);
    save(input, receipt, "uninstalled");
    return summary(input, "uninstalled");
  });
}
