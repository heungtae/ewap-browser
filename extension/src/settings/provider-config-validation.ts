import { fail, isPlainObject } from "../security/validation.js";
import { AUTH_SCHEMES, WIRE_APIS } from "../providers/types.js";
import type { ProviderConfig } from "../providers/types.js";
import { providerHeaders } from "../providers/provider-request.js";
import { validateProviderBaseUrl } from "../providers/provider-network-url.js";

export const providerIdentifier = (value: string): string =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)
    ? value
    : fail("INVALID_ARGUMENT");

export const validateProviderConfig = (config: ProviderConfig): void => {
  if (
    !isPlainObject(config) ||
    Object.keys(config).some(
      (key) =>
        ![
          "plugin_id",
          "plugin_version",
          "label",
          "base_url",
          "wire_api",
          "model",
          "api_key",
          "api_key_header",
          "headers",
          "timeout_ms",
          "enabled",
          "private_network_opt_in",
        ].includes(key),
    ) ||
    !/^\d+\.\d+\.\d+$/.test(config.plugin_version) ||
    !WIRE_APIS.includes(config.wire_api) ||
    !AUTH_SCHEMES.includes(config.api_key_header) ||
    typeof config.label !== "string" ||
    !config.label ||
    typeof config.model !== "string" ||
    !config.model ||
    typeof config.api_key !== "string" ||
    typeof config.enabled !== "boolean" ||
    (config.private_network_opt_in !== undefined &&
      typeof config.private_network_opt_in !== "boolean") ||
    !Number.isInteger(config.timeout_ms) ||
    config.timeout_ms < 100 ||
    config.timeout_ms > 300_000 ||
    !Array.isArray(config.headers)
  )
    fail("INVALID_ARGUMENT");
  providerIdentifier(config.plugin_id);
  validateProviderBaseUrl(config.base_url, config.private_network_opt_in);
  for (const header of config.headers)
    if (
      !isPlainObject(header) ||
      Object.keys(header).some((key) => !["name", "value"].includes(key)) ||
      typeof header.name !== "string" ||
      typeof header.value !== "string"
    )
      fail("INVALID_ARGUMENT");
  providerHeaders(config);
};
