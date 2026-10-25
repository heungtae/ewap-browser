import {
  protectedFile,
  atomicPrivate,
  privateDirectory,
} from "./install-files.js";
import { releaseHash } from "./release-files.js";
import {
  assertInput,
  installReceiptSchema,
  nativeHost,
  type InstallationInput,
  type InstallationReceipt,
} from "./install-plan.js";
export function ownedPaths(input: InstallationInput) {
  return {
    launcher: `${input.directory}/host.sh`,
    registration: `${input.registry}/${nativeHost}.json`,
    receipt: `${input.directory}/installation.json`,
  };
}
export function previousReceipt(input: InstallationInput) {
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
export function assertOwned(
  input: InstallationInput,
  receipt?: InstallationReceipt,
) {
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
export function save(
  input: InstallationInput,
  receipt: InstallationReceipt,
  state: InstallationReceipt["state"],
) {
  atomicPrivate(
    ownedPaths(input).receipt,
    JSON.stringify({ ...receipt, state }),
  );
}
export function prepare(input: InstallationInput) {
  assertInput(input);
  privateDirectory(input.directory);
  privateDirectory(input.registry);
}
export function summary(
  input: InstallationInput,
  state: "installed" | "uninstalled",
) {
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
export function assertNoTransition(input: InstallationInput) {
  if (protectedFile(`${input.directory}/transition.json`) !== undefined)
    throw new Error("INSTALL_TRANSITION_PENDING");
}
