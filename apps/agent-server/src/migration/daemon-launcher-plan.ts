import { z } from "zod";
import { releaseHash } from "./release-files.js";
import type { InstallationInput } from "./install-plan.js";
export const daemonMode = z.enum(["session-only", "os-store"]);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const daemonReceiptSchema = z.strictObject({
  schema: z.literal("wca.daemon-launcher/v1"),
  state: z.enum(["installing", "installed", "removing"]),
  directory: z.string(),
  registry: z.string(),
  extensionId: z.string().regex(/^[a-p]{32}$/),
  releaseDirectory: z.string(),
  releaseId: hex,
  executable: z.string(),
  mode: daemonMode,
  configDigest: hex,
  launcherDigest: hex,
});
export type DaemonReceipt = z.infer<typeof daemonReceiptSchema>;
export function daemonPaths(input: InstallationInput) {
  return {
    launcher: `${input.directory}/migration.sh`,
    receipt: `${input.directory}/migration-launcher.json`,
  };
}
export function daemonPlan(
  input: InstallationInput,
  mode: z.infer<typeof daemonMode>,
  configDigest: string,
) {
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const launcher = `#!/bin/sh\nif [ "$#" -ne 0 ]; then exit 64; fi\nexec ${quote(process.execPath)} ${quote(`${input.releaseDirectory}/agent-server/migration-daemon.mjs`)} ${quote(input.releaseId)} ${quote(`${input.directory}/pairing.json`)} --settings-${mode} --installed\n`;
  return {
    launcher,
    receipt: daemonReceiptSchema.parse({
      ...input,
      schema: "wca.daemon-launcher/v1",
      state: "installed",
      executable: process.execPath,
      mode,
      configDigest,
      launcherDigest: releaseHash(launcher),
    }),
  };
}
