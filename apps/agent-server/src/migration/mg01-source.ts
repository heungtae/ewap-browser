import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import { recordSchema } from "../../../../packages/shared/src/migration-settings.js";
export {
  providerId,
  configSchema,
  settingsSourceSchema,
  recordSchema,
} from "../../../../packages/shared/src/migration-settings.js";
export type LegacyProvider = z.infer<typeof recordSchema>;
export function settingsDigest(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
export interface Mg01Source {
  assertFrozen(epoch: number): Promise<void>;
  readProviderSettings(): Promise<unknown>;
}
export async function captureSettings(source: Mg01Source, epoch: number) {
  await source.assertFrozen(epoch);
  let raw: unknown;
  try {
    raw = structuredClone(await source.readProviderSettings());
  } catch {
    throw new Error("MG01_SOURCE_UNAVAILABLE");
  }
  const value = raw ?? { schema_version: 1, providers: {} };
  const snapshot = { provider_settings: raw };
  if (Buffer.byteLength(canonicalJson(snapshot)) > 4 * 1024 * 1024)
    throw new Error("MG01_SOURCE_LIMIT");
  return { raw: value, digest: settingsDigest(snapshot) };
}
