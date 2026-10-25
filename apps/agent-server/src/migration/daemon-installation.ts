import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import {
  atomicPrivate,
  assertStopped,
  durableRemove,
  protectedFile,
  withInstallLock,
} from "./install-files.js";
import { assertInput, type InstallationInput } from "./install-plan.js";
import { prepare, previousReceipt } from "./install-state.js";
import { assertInstalledStart } from "./installed-start.js";
import { releaseHash } from "./release-files.js";
import { verifyReleaseSet } from "./release-set.js";
import {
  daemonMode,
  daemonPaths,
  daemonPlan,
  daemonReceiptSchema,
  type DaemonReceipt,
} from "./daemon-launcher-plan.js";
function prior(input: InstallationInput) {
  const paths = daemonPaths(input),
    raw = protectedFile(paths.receipt);
  let receipt: DaemonReceipt | undefined;
  if (raw !== undefined) {
    try {
      receipt = daemonReceiptSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error("DAEMON_RECEIPT_INVALID");
    }
    for (const key of ["directory", "registry", "extensionId"] as const)
      if (receipt[key] !== input[key])
        throw new Error("DAEMON_IDENTITY_CONFLICT");
    const config = protectedFile(`${input.directory}/pairing.json`);
    if (config === undefined || releaseHash(config) !== receipt.configDigest)
      throw new Error("INSTALL_PAIRING_CONFLICT");
  }
  const body = protectedFile(paths.launcher);
  if (
    body !== undefined &&
    (!receipt || releaseHash(body) !== receipt.launcherDigest)
  )
    throw new Error("DAEMON_FOREIGN_FILE");
  return receipt;
}
export function installDaemonLauncher(
  input: InstallationInput,
  rawMode: unknown,
) {
  assertInput(input);
  const parsedMode = daemonMode.safeParse(rawMode);
  if (!parsedMode.success) throw new Error("DAEMON_MODE");
  const mode = parsedMode.data,
    release = verifyReleaseSet(input.releaseDirectory, input.releaseId);
  const required = [
    "agent-server/migration-daemon.mjs",
    ...(mode === "os-store"
      ? [
          "agent-server/secret-service.py",
          "agent-server/linux-secret-store.mjs",
        ]
      : []),
  ];
  if (
    required.some((path) => !release.files.some((file) => file.path === path))
  )
    throw new Error("DAEMON_PACKAGE_REQUIRED");
  prepare(input);
  return withInstallLock(input.directory, () => {
    assertStopped(input.directory);
    assertInstalledStart(
      input.directory,
      input.releaseDirectory,
      input.releaseId,
    );
    const native = previousReceipt(input);
    if (!native || native.state !== "installed")
      throw new Error("INSTALL_NOT_ACTIVE");
    const old = prior(input),
      plan = daemonPlan(input, mode, native.configDigest),
      paths = daemonPaths(input);
    if (old?.state === "removing") throw new Error("DAEMON_REMOVAL_PENDING");
    if (old && old.mode !== mode)
      throw new Error("DAEMON_MODE_CHANGE_REQUIRES_REMOVAL");
    if (
      old?.state === "installing" &&
      canonicalJson({ ...old, state: "installed" }) !==
        canonicalJson(plan.receipt)
    )
      throw new Error("DAEMON_PLAN_CONFLICT");
    atomicPrivate(
      paths.receipt,
      JSON.stringify({ ...plan.receipt, state: "installing" }),
    );
    atomicPrivate(paths.launcher, plan.launcher, 0o700);
    atomicPrivate(paths.receipt, JSON.stringify(plan.receipt));
    return {
      scope: "qualification-only",
      mode,
      releaseId: input.releaseId,
      launcher: paths.launcher,
      started: false,
    } as const;
  });
}
export function removeDaemonLauncher(input: InstallationInput) {
  prepare(input);
  return withInstallLock(input.directory, () => {
    assertStopped(input.directory);
    const old = prior(input);
    if (!old) throw new Error("DAEMON_OWNERSHIP_MISSING");
    const paths = daemonPaths(input);
    atomicPrivate(paths.receipt, JSON.stringify({ ...old, state: "removing" }));
    if (protectedFile(paths.launcher) !== undefined)
      durableRemove(paths.launcher);
    durableRemove(paths.receipt);
    return {
      removed: true,
      pairingPreserved: true,
      credentialsDeleted: false,
    } as const;
  });
}
