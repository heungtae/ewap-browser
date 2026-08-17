import { fail, isPlainObject } from "../security/validation.js";
import {
  AUTH_SCHEMES,
  WIRE_APIS,
  type AuthScheme,
  type ProviderPluginManifest,
  type WireApi,
} from "./types.js";

const keys = new Set([
  "schema_version",
  "plugin_id",
  "plugin_version",
  "api_version",
  "label",
  "adapter_id",
  "wire_apis",
  "auth_schemes",
  "default_base_url",
]);
const hasControl = (value: string): boolean =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
const text = (value: unknown, max: number): string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= max &&
  !hasControl(value)
    ? value
    : fail("INVALID_ARGUMENT");
const exactArray = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): T[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    new Set(value).size !== value.length ||
    value.some(
      (item) => typeof item !== "string" || !allowed.includes(item as T),
    )
  )
    fail("INVALID_ARGUMENT");
  return [...(value as unknown[])] as T[];
};

export const validatePluginManifest = (
  value: unknown,
): ProviderPluginManifest => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !keys.has(key)) ||
    value.schema_version !== 1 ||
    value.api_version !== 1
  )
    return fail("INVALID_ARGUMENT");
  const pluginId = text(value.plugin_id, 100);
  const version = text(value.plugin_version, 32);
  const adapterId = text(value.adapter_id, 100);
  if (
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(pluginId) ||
    !/^\d+\.\d+\.\d+$/.test(version) ||
    !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(adapterId)
  )
    return fail("INVALID_ARGUMENT");
  let defaultBaseUrl: string | undefined;
  if (value.default_base_url !== undefined) {
    defaultBaseUrl = text(value.default_base_url, 2048);
    const url = new URL(defaultBaseUrl);
    if (url.username || url.password || url.search || url.hash)
      return fail("INVALID_ARGUMENT");
  }
  return {
    schema_version: 1,
    plugin_id: pluginId,
    plugin_version: version,
    api_version: 1,
    label: text(value.label, 100),
    adapter_id: adapterId,
    wire_apis: exactArray<WireApi>(value.wire_apis, WIRE_APIS),
    auth_schemes: exactArray<AuthScheme>(value.auth_schemes, AUTH_SCHEMES),
    ...(defaultBaseUrl ? { default_base_url: defaultBaseUrl } : {}),
  };
};
