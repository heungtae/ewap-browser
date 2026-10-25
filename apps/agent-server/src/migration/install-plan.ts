import { randomBytes, randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { configSchema } from "../native/config.js";
import { releaseHash } from "./release-files.js";
import { atomicPrivate, protectedFile } from "./install-files.js";
export const nativeHost = "ai.contextpilot.agent";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const installReceiptSchema = z.strictObject({
  schema: z.literal("wca.installation/v1"),
  state: z.enum(["installing", "installed", "removing", "uninstalled"]),
  directory: z.string(),
  registry: z.string(),
  releaseDirectory: z.string(),
  releaseId: hex,
  executable: z.string(),
  extensionId: z.string().regex(/^[a-p]{32}$/),
  configDigest: hex,
  launcherDigest: hex,
  registrationDigest: hex,
});
export type InstallationReceipt = z.infer<typeof installReceiptSchema>;
export interface InstallationInput {
  directory: string;
  registry: string;
  releaseDirectory: string;
  releaseId: string;
  extensionId: string;
}
function parsePairing(raw: string) {
  try {
    return configSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("INSTALL_PAIRING_INVALID");
  }
}
export function pairing(input: InstallationInput) {
  const path = `${input.directory}/pairing.json`;
  const previous = protectedFile(path);
  const value =
    previous === undefined
      ? configSchema.parse({
          installationId: randomUUID(),
          profileId: randomUUID(),
          extensionIds: [input.extensionId],
          secret: randomBytes(32).toString("hex"),
          socketPath: `${input.directory}/agent.sock`,
        })
      : parsePairing(previous);
  if (
    value.socketPath !== `${input.directory}/agent.sock` ||
    value.extensionIds.length !== 1 ||
    value.extensionIds[0] !== input.extensionId
  )
    throw new Error("INSTALL_PAIRING_CONFLICT");
  if (previous === undefined) atomicPrivate(path, JSON.stringify(value));
  return releaseHash(protectedFile(path)!);
}
export function installationPlan(
  input: InstallationInput,
  configDigest: string,
) {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const launcher = `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(`${input.releaseDirectory}/agent-server/launcher.cjs`)} native ${quote(`${input.directory}/pairing.json`)} "$@"\n`;
  const registration = JSON.stringify({
    name: nativeHost,
    description: "ContextPilot qualification agent",
    path: `${input.directory}/host.sh`,
    type: "stdio",
    allowed_origins: [`chrome-extension://${input.extensionId}/`],
  });
  const receipt = installReceiptSchema.parse({
    ...input,
    schema: "wca.installation/v1",
    state: "installing",
    executable: process.execPath,
    configDigest,
    launcherDigest: releaseHash(launcher),
    registrationDigest: releaseHash(registration),
  });
  return { receipt, launcher, registration };
}
export function assertInput(input: InstallationInput) {
  if (
    process.platform !== "linux" ||
    !/^[a-p]{32}$/.test(input.extensionId) ||
    !/^[a-f0-9]{64}$/.test(input.releaseId) ||
    !isAbsolute(input.releaseDirectory) ||
    resolve(input.releaseDirectory) !== input.releaseDirectory
  )
    throw new Error("INSTALL_INPUT");
  const roots = [input.directory, input.registry, input.releaseDirectory];
  if (
    roots.some((path) => /[\n\r\0]/.test(path)) ||
    roots.some((path, index) =>
      roots.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          (path === other || path.startsWith(`${other}/`)),
      ),
    )
  )
    throw new Error("INSTALL_PATH");
}
