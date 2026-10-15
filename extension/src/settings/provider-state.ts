import { fail, isPlainObject } from "../security/validation.js";
import type { ProviderConfig, ProviderKind } from "../providers/types.js";
import {
  providerIdentifier,
  validateProviderConfig,
} from "./provider-config-validation.js";

export type ModelRouting = {
  mode: "single" | "jev";
  decision_provider?: string;
  pre_dispatch_failure: "primary" | "stop";
};
export type ProviderRecord = { kind: ProviderKind; config: ProviderConfig };
export type ProviderSettingsState = {
  schema_version: 2;
  revision: number;
  providers: Record<string, ProviderRecord>;
  active_provider?: string;
  routing: ModelRouting;
};
export const singleRouting = (): ModelRouting => ({
  mode: "single",
  pre_dispatch_failure: "primary",
});
export const validateRouting = (value: unknown): ModelRouting => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (k) => !["mode", "decision_provider", "pre_dispatch_failure"].includes(k),
    ) ||
    !["single", "jev"].includes(String(value.mode)) ||
    !["primary", "stop"].includes(String(value.pre_dispatch_failure)) ||
    (value.decision_provider !== undefined &&
      typeof value.decision_provider !== "string")
  )
    return fail("INVALID_ARGUMENT");
  if (typeof value.decision_provider === "string")
    providerIdentifier(value.decision_provider);
  return structuredClone(value) as ModelRouting;
};
export const usableJev = (
  record?: ProviderRecord,
): ProviderConfig | undefined => {
  if (
    record?.kind !== "typesafe_jev" ||
    Object.keys(record).some((k) => !["kind", "config"].includes(k))
  )
    return undefined;
  try {
    const config = { ...record.config, kind: record.kind };
    validateProviderConfig(config);
    return config.enabled ? config : undefined;
  } catch {
    return undefined;
  }
};
export const decodeProviderState = (value: unknown): ProviderSettingsState => {
  if (value == null)
    return {
      schema_version: 2,
      revision: 0,
      providers: {},
      routing: singleRouting(),
    };
  if (
    !isPlainObject(value) ||
    (value.schema_version !== 1 && value.schema_version !== 2) ||
    !isPlainObject(value.providers) ||
    Object.keys(value).some(
      (k) =>
        ![
          "schema_version",
          "providers",
          "active_provider",
          ...(value.schema_version === 2 ? ["revision", "routing"] : []),
        ].includes(k),
    )
  )
    return fail("INVALID_ARGUMENT");
  const providers: Record<string, ProviderRecord> = {};
  for (const [id, raw] of Object.entries(value.providers)) {
    providerIdentifier(id);
    const record =
      value.schema_version === 1
        ? { kind: "openai_compatible", config: raw }
        : raw;
    if (isPlainObject(record) && record.kind === "typesafe_jev") {
      providers[id] = {
        ...structuredClone(record),
        kind: "typesafe_jev",
        config: (isPlainObject(record.config)
          ? { ...record.config, kind: "typesafe_jev" }
          : record.config) as ProviderConfig,
      };
      continue;
    }
    if (
      !isPlainObject(record) ||
      !["openai_compatible", "typesafe_jev"].includes(String(record.kind)) ||
      !isPlainObject(record.config) ||
      Object.keys(record).some((k) => !["kind", "config"].includes(k))
    )
      return fail("INVALID_ARGUMENT");
    const config = { ...record.config, kind: record.kind } as ProviderConfig;
    // Repairable optional Jev records must never poison a valid primary selection.
    if (record.kind === "openai_compatible") validateProviderConfig(config);
    providers[id] = { kind: record.kind as ProviderKind, config };
  }
  if (
    value.active_provider !== undefined &&
    (typeof value.active_provider !== "string" ||
      providers[value.active_provider]?.kind !== "openai_compatible")
  )
    return fail("INVALID_ARGUMENT");
  if (
    value.schema_version === 2 &&
    (!Number.isSafeInteger(value.revision) || Number(value.revision) < 0)
  )
    return fail("INVALID_ARGUMENT");
  return {
    schema_version: 2,
    revision: value.schema_version === 1 ? 0 : Number(value.revision),
    providers,
    ...(typeof value.active_provider === "string"
      ? { active_provider: value.active_provider }
      : {}),
    routing:
      value.schema_version === 1
        ? singleRouting()
        : validateRouting(value.routing),
  };
};
