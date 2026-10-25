import type { SecretStore } from "../settings/service.js";
import { migrateProviderRoles } from "../settings/role-migration.js";
import { isPlainObject } from "../../../../extension/src/security/validation.js";
import {
  settingsSourceSchema,
  recordSchema,
  providerId,
} from "./mg01-source.js";
import {
  migrationCredentialIdentity,
  readCredential,
  mergeCredential,
  validateCredential,
  hasCredential,
  transferCredential,
} from "./mg01-credentials.js";
import type { Mg01Conversion, PublicMigratedProvider } from "./mg01-types.js";
function sourceSecrets(raw: unknown): string[] {
  if (!isPlainObject(raw) || !isPlainObject(raw.providers)) return [];
  return Object.values(raw.providers).flatMap((entry) => {
    const config =
      raw.schema_version === 1
        ? entry
        : isPlainObject(entry)
          ? entry.config
          : undefined;
    if (!isPlainObject(config)) return [];
    return [
      config.api_key,
      ...(Array.isArray(config.headers)
        ? config.headers.map((h) => (isPlainObject(h) ? h.value : undefined))
        : []),
    ].filter(
      (value): value is string =>
        typeof value === "string" && Boolean(value.trim()),
    );
  });
}
export async function convertMg01(
  raw: unknown,
  profileGuard: string,
  store: SecretStore,
  write: boolean,
  guard: () => Promise<void>,
): Promise<Mg01Conversion> {
  const result: Mg01Conversion = {
    schema: "wca.mg01-settings/v1",
    controllerFailure: "stop",
    secretMode: store.mode,
    records: [],
    quarantine: [],
    sourceCount: 0,
  };
  const parsed = settingsSourceSchema.safeParse(raw);
  if (!parsed.success) {
    result.sourceCount = 1;
    result.quarantine.push({ sourceIndex: 0, reason: "INVALID_CONTAINER" });
    return result;
  }
  const outer = parsed.data;
  const secrets = sourceSecrets(raw);
  const plans: {
    sourceIndex: number;
    record: PublicMigratedProvider;
    bundle: ReturnType<typeof mergeCredential>;
  }[] = [];
  for (const [sourceIndex, [id, value]] of Object.entries(outer.providers)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .entries()) {
    result.sourceCount++;
    const decoded = recordSchema.safeParse(
      outer.schema_version === 1
        ? { kind: "openai_compatible", config: value }
        : value,
    );
    if (
      !providerId.safeParse(id).success ||
      !decoded.success ||
      (decoded.data.config.kind !== undefined &&
        decoded.data.config.kind !== decoded.data.kind)
    ) {
      result.quarantine.push({ sourceIndex, reason: "INVALID_PROVIDER" });
      continue;
    }
    const row = decoded.data,
      config = row.config;
    let identity: string;
    try {
      identity = migrationCredentialIdentity(row, id, profileGuard);
    } catch {
      result.quarantine.push({ sourceIndex, reason: "INVALID_PROVIDER" });
      continue;
    }
    await guard();
    const bundle = mergeCredential(row, await readCredential(store, identity));
    try {
      validateCredential(row, bundle);
    } catch {
      result.quarantine.push({ sourceIndex, reason: "SECRET_REQUIRES_REPAIR" });
      continue;
    }
    secrets.push(bundle.apiKey, ...Object.values(bundle.headers));
    const roles = migrateProviderRoles({
      schema_version: 2,
      providers: {
        [id]: {
          kind: row.kind,
          config: {
            base_url: config.base_url,
            model: config.model,
            wire_api: config.wire_api,
            enabled: config.enabled,
            api_key_header: config.api_key_header,
          },
        },
      },
      ...(outer.active_provider === id ? { active_provider: id } : {}),
      routing: {
        ...(outer.routing?.mode === "jev" &&
        outer.routing.decision_provider === id
          ? { decision_provider: id }
          : {}),
      },
    });
    const role = roles.candidates[0]?.role;
    plans.push({
      sourceIndex,
      bundle,
      record: {
        providerId: id,
        kind: row.kind,
        label: config.label,
        endpoint: config.base_url,
        model: config.model,
        wireApi: config.wire_api,
        auth: config.api_key_header,
        headerNames: config.headers.map((h) => h.name.toLowerCase()),
        timeoutMs: config.timeout_ms,
        sourceEnabled: config.enabled,
        sourcePrivateNetworkOptIn: config.private_network_opt_in === true,
        enabled: false,
        ready: false,
        ...(role ? { candidateRole: role } : {}),
        ...(!config.enabled
          ? { repair: "DISABLED" as const }
          : !role
            ? { repair: "ROLE_REQUIRES_REPAIR" as const }
            : {}),
        credentialRef: { identity, hasMaterial: hasCredential(bundle) },
      },
    });
  }
  for (const plan of plans) {
    if (
      secrets.some(
        (secret) => secret && JSON.stringify(plan.record).includes(secret),
      )
    ) {
      result.quarantine.push({
        sourceIndex: plan.sourceIndex,
        reason: "SENSITIVE_PUBLIC_METADATA",
      });
      continue;
    }
    await guard();
    if (plan.record.credentialRef.hasMaterial)
      await transferCredential(
        store,
        plan.record.credentialRef.identity,
        plan.bundle,
        write,
      );
    await guard();
    result.records.push(plan.record);
  }
  return result;
}
