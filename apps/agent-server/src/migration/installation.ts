import { realpathSync } from "node:fs";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import { verifyReleaseSet } from "./release-set.js";
import { releaseHash } from "./release-files.js";
import {
  privateDirectory,
  protectedFile,
  atomicPrivate,
  withInstallLock,
  assertStopped,
  durableRemove,
} from "./install-files.js";
import {
  assertInput,
  pairing,
  installationPlan,
  installReceiptSchema,
  nativeHost,
  type InstallationInput,
  type InstallationReceipt,
} from "./install-plan.js";
function ownedPaths(input: InstallationInput) {
  return {
    launcher: `${input.directory}/host.sh`,
    registration: `${input.registry}/${nativeHost}.json`,
    receipt: `${input.directory}/installation.json`,
  };
}
function previousReceipt(input: InstallationInput) {
  const body = protectedFile(ownedPaths(input).receipt);
  if (body === undefined) return undefined;
  let value: InstallationReceipt;
  try {
    value = installReceiptSchema.parse(JSON.parse(body));
  } catch {
    throw new Error("INSTALL_RECEIPT_INVALID");
  }
  for (const key of [
    "directory",
    "registry",
    "releaseDirectory",
    "releaseId",
    "extensionId",
  ] as const)
    if (value[key] !== input[key]) throw new Error("INSTALL_IDENTITY_CONFLICT");
  if (value.executable !== process.execPath)
    throw new Error("INSTALL_EXECUTABLE_CONFLICT");
  const config = protectedFile(`${input.directory}/pairing.json`);
  if (config === undefined || releaseHash(config) !== value.configDigest)
    throw new Error("INSTALL_PAIRING_CONFLICT");
  return value;
}
function assertOwned(input: InstallationInput, receipt?: InstallationReceipt) {
  const paths = ownedPaths(input);
  for (const key of ["launcher", "registration"] as const) {
    const body = protectedFile(paths[key]);
    if (
      body !== undefined &&
      (!receipt || releaseHash(body) !== receipt[`${key}Digest`])
    )
      throw new Error("INSTALL_FOREIGN_FILE");
  }
}
function save(
  input: InstallationInput,
  receipt: InstallationReceipt,
  state: InstallationReceipt["state"],
) {
  atomicPrivate(
    ownedPaths(input).receipt,
    JSON.stringify({ ...receipt, state }),
  );
}
function prepare(input: InstallationInput) {
  assertInput(input);
  privateDirectory(input.directory);
  privateDirectory(input.registry);
}
function summary(input: InstallationInput, state: "installed" | "uninstalled") {
  return {
    state,
    releaseId: input.releaseId,
    host: nativeHost,
    registered: state === "installed",
    credentials: "session-only",
    pairingPreserved: true,
    scope: "qualification-only",
    configPath: `${input.directory}/pairing.json`,
  } as const;
}
export function installRelease(input: InstallationInput) {
  // Verify before creating or touching installation state.
  assertInput(input);
  if (realpathSync(input.releaseDirectory) !== input.releaseDirectory)
    throw new Error("INSTALL_PATH");
  verifyReleaseSet(input.releaseDirectory, input.releaseId);
  prepare(input);
  return withInstallLock(input.directory, () => {
    assertStopped(input.directory);
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
