import { realpathSync } from "node:fs";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import { verifyReleaseSet } from "./release-set.js";
import { releaseHash } from "./release-files.js";
import { assertInput, type InstallationInput } from "./install-plan.js";
import {
  assertStopped,
  atomicPrivate,
  protectedFile,
  durableRemove,
  withInstallLock,
} from "./install-files.js";
import {
  ownedPaths,
  prepare,
  previousReceipt,
  assertOwned,
  save,
  summary,
} from "./install-state.js";
import { transitionPlan, readTransition } from "./install-transition-plan.js";
function verifyInputs(from: InstallationInput, to: InstallationInput) {
  for (const input of [from, to]) {
    assertInput(input);
    if (realpathSync(input.releaseDirectory) !== input.releaseDirectory)
      throw new Error("INSTALL_PATH");
    verifyReleaseSet(input.releaseDirectory, input.releaseId);
  }
  if (
    from.directory !== to.directory ||
    from.registry !== to.registry ||
    from.extensionId !== to.extensionId ||
    from.releaseId === to.releaseId ||
    from.releaseDirectory === to.releaseDirectory
  )
    throw new Error("INSTALL_TRANSITION_IDENTITY");
}
export function transitionRelease(
  from: InstallationInput,
  to: InstallationInput,
) {
  // Both immutable sets must still verify: this never infers compatibility from an arbitrary label.
  verifyInputs(from, to);
  prepare(from);
  return withInstallLock(from.directory, () => {
    assertStopped(from.directory);
    const config = protectedFile(`${from.directory}/pairing.json`);
    if (config === undefined) throw new Error("INSTALL_PAIRING_CONFLICT");
    const plan = transitionPlan(from, to, releaseHash(config));
    const path = `${from.directory}/transition.json`,
      pending = protectedFile(path);
    const paths = ownedPaths(from);
    if (pending !== undefined) {
      readTransition(pending, plan.journal);
      let current;
      try {
        current = previousReceipt(from);
      } catch {
        current = previousReceipt(to);
      }
      if (
        !current ||
        ![plan.journal.from, plan.journal.to].some(
          (receipt) => canonicalJson(current) === canonicalJson(receipt),
        )
      )
        throw new Error("INSTALL_TRANSITION_RECEIPT");
      for (const key of ["launcher", "registration"] as const) {
        const body = protectedFile(paths[key]);
        if (
          body !== undefined &&
          ![
            plan.journal.from[`${key}Digest`],
            plan.journal.to[`${key}Digest`],
          ].includes(releaseHash(body))
        )
          throw new Error("INSTALL_FOREIGN_FILE");
      }
    } else {
      let current;
      try {
        current = previousReceipt(from);
      } catch {
        current = previousReceipt(to);
      }
      if (current?.releaseId === to.releaseId) {
        if (canonicalJson(current) !== canonicalJson(plan.journal.to))
          throw new Error("INSTALL_TRANSITION_RECEIPT");
        assertOwned(to, current);
        if (
          [paths.launcher, paths.registration].some(
            (file) => protectedFile(file) === undefined,
          )
        )
          throw new Error("INSTALL_REPAIR_REQUIRED");
        return summary(to, "installed");
      }
      if (
        !current ||
        canonicalJson(current) !== canonicalJson(plan.journal.from)
      )
        throw new Error("INSTALL_TRANSITION_RECEIPT");
      assertOwned(from, current);
      if (
        [paths.launcher, paths.registration].some(
          (file) => protectedFile(file) === undefined,
        )
      )
        throw new Error("INSTALL_REPAIR_REQUIRED");
      atomicPrivate(path, JSON.stringify(plan.journal));
    }
    atomicPrivate(paths.launcher, plan.launcher, 0o700);
    atomicPrivate(paths.registration, plan.registration);
    save(to, plan.journal.to, "installed");
    durableRemove(path);
    return summary(to, "installed");
  });
}
