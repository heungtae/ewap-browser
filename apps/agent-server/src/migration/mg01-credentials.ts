import { z } from "zod";
import type { SecretStore } from "../settings/service.js";
import { AnalystSecrets } from "../settings/analyst-secrets.js";
import { credentialIdentity } from "../settings/role-migration.js";
import { validateProviderConfig } from "../../../../extension/src/settings/provider-config-validation.js";
import type { ProviderConfig } from "../../../../extension/src/providers/types.js";
import { settingsDigest, type LegacyProvider } from "./mg01-source.js";
const bundleSchema = z.strictObject({
  apiKey: z.string().max(4096),
  headers: z.record(z.string(), z.string().max(4096)),
});
export type CredentialBundle = z.infer<typeof bundleSchema>;
export function migrationCredentialIdentity(
  row: LegacyProvider,
  id: string,
  profileGuard: string,
) {
  return credentialIdentity({
    providerId: id,
    endpoint: row.config.base_url,
    kind: row.kind === "typesafe_jev" ? "controller" : "analyst",
    auth: row.config.api_key_header,
    credentialBoundary: settingsDigest([
      "wca.mg01-credentials/v1",
      profileGuard,
      row.config.headers.map((h) => h.name.toLowerCase()).sort(),
    ]),
  });
}
export async function readCredential(store: SecretStore, identity: string) {
  let value: string | undefined;
  try {
    value = await new AnalystSecrets(store).read(identity);
  } catch {
    throw new Error("MG01_SECRET_READBACK");
  }
  if (value === undefined) return undefined;
  try {
    return bundleSchema.parse(JSON.parse(value));
  } catch {
    throw new Error("MG01_SECRET_TARGET_FORMAT");
  }
}
export function mergeCredential(
  row: LegacyProvider,
  previous?: CredentialBundle,
): CredentialBundle {
  return {
    apiKey: row.config.api_key.trim()
      ? row.config.api_key
      : (previous?.apiKey ?? ""),
    headers: Object.fromEntries(
      row.config.headers.map((h) => [
        h.name.toLowerCase(),
        h.value.trim()
          ? h.value
          : (previous?.headers[h.name.toLowerCase()] ?? ""),
      ]),
    ),
  };
}
export function validateCredential(
  row: LegacyProvider,
  bundle: CredentialBundle,
) {
  const { private_network_opt_in: privateNetwork, ...source } = row.config;
  const config: ProviderConfig = {
    ...source,
    ...(privateNetwork === undefined
      ? {}
      : { private_network_opt_in: privateNetwork }),
    kind: row.kind,
    api_key: bundle.apiKey,
    headers: row.config.headers.map((h) => ({
      name: h.name,
      value: bundle.headers[h.name.toLowerCase()] ?? "",
    })),
  };
  validateProviderConfig(config);
}
export const hasCredential = (bundle: CredentialBundle) =>
  Boolean(bundle.apiKey || Object.values(bundle.headers).some(Boolean));
export async function transferCredential(
  store: SecretStore,
  identity: string,
  bundle: CredentialBundle,
  write: boolean,
) {
  const current = await readCredential(store, identity);
  if (settingsDigest(current ?? null) === settingsDigest(bundle)) return;
  if (!write) throw new Error("MG01_SECRET_READBACK");
  try {
    await new AnalystSecrets(store).write(identity, JSON.stringify(bundle));
  } catch {
    throw new Error("MG01_SECRET_WRITE_FAILED");
  }
  const readback = await readCredential(store, identity);
  if (!readback || settingsDigest(readback) !== settingsDigest(bundle))
    throw new Error("MG01_SECRET_READBACK");
}
