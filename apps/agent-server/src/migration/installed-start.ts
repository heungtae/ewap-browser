import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import { protectedFile } from "./install-files.js";
import {
  assertInput,
  installReceiptSchema,
  installationPlan,
} from "./install-plan.js";
import {
  assertNoTransition,
  assertOwned,
  ownedPaths,
  previousReceipt,
} from "./install-state.js";
// Caller holds the shared installation lock for validation and the daemon lifetime.
export function assertInstalledStart(
  directory: string,
  releaseDirectory: string,
  releaseId: string,
) {
  const raw = protectedFile(`${directory}/installation.json`);
  if (raw === undefined) throw new Error("INSTALL_OWNERSHIP_MISSING");
  const parsed = installReceiptSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("INSTALL_RECEIPT_INVALID");
  const input = {
    directory,
    releaseDirectory,
    releaseId,
    registry: parsed.data.registry,
    extensionId: parsed.data.extensionId,
  };
  assertInput(input);
  if (
    !isAbsolute(input.registry) ||
    resolve(input.registry) !== input.registry ||
    realpathSync(input.registry) !== input.registry
  )
    throw new Error("INSTALL_PATH");
  const registry = lstatSync(input.registry);
  if (
    !registry.isDirectory() ||
    registry.uid !== process.getuid?.() ||
    registry.mode & 0o077
  )
    throw new Error("INSTALL_PERMISSIONS");
  assertNoTransition(input);
  const receipt = previousReceipt(input);
  if (!receipt || receipt.state !== "installed")
    throw new Error("INSTALL_NOT_ACTIVE");
  const expected = {
    ...installationPlan(input, receipt.configDigest).receipt,
    state: "installed",
  };
  if (canonicalJson(receipt) !== canonicalJson(expected))
    throw new Error("INSTALL_PLAN_CONFLICT");
  assertOwned(input, receipt);
  const paths = ownedPaths(input);
  if (
    [paths.launcher, paths.registration].some(
      (path) => protectedFile(path) === undefined,
    )
  )
    throw new Error("INSTALL_REPAIR_REQUIRED");
  return input.extensionId;
}
