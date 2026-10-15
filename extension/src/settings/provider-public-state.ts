import { isPlainObject } from "../security/validation.js";
import { validateProviderBaseUrl } from "../providers/provider-network-url.js";
import type { ProviderSettingsState } from "./provider-state.js";
import type { PublicProviderConfig } from "../providers/types.js";
export const publicProviders = (
  state: ProviderSettingsState,
): Record<string, PublicProviderConfig> => {
  return Object.fromEntries(
    Object.entries(state.providers).map(([id, record]) => {
      const config: Record<string, unknown> = isPlainObject(record.config)
        ? record.config
        : {};
      const { api_key, headers, ...publicConfig } = config;
      // Whitelist public fields even for an invalid, repairable optional record.
      const safe = Object.fromEntries(
        [
          "plugin_id",
          "plugin_version",
          "label",
          "base_url",
          "wire_api",
          "model",
          "api_key_header",
          "timeout_ms",
          "enabled",
          "private_network_opt_in",
        ]
          .filter((k) => k in publicConfig)
          .map((k) => [k, publicConfig[k as keyof typeof publicConfig]])
          .filter(([, v]) =>
            ["string", "number", "boolean"].includes(typeof v),
          ),
      );
      if (record.kind === "typesafe_jev") {
        try {
          validateProviderBaseUrl(
            typeof config.base_url === "string" ? config.base_url : "",
            config.private_network_opt_in === true,
          );
        } catch {
          safe.base_url = "";
        }
      }
      return [
        id,
        {
          plugin_id:
            record.kind === "typesafe_jev"
              ? "contextpilot.typesafe-jev"
              : "contextpilot.openai-compatible",
          plugin_version: "1.0.0",
          label: id,
          base_url: "",
          model: "",
          wire_api: "chat_completions",
          api_key_header:
            record.kind === "typesafe_jev" ? "authorization_bearer" : "none",
          timeout_ms: 120_000,
          enabled: false,
          ...safe,
          kind: record.kind,
          has_api_key: typeof api_key === "string" && api_key.length > 0,
          header_names: Array.isArray(headers)
            ? headers.flatMap((h) =>
                isPlainObject(h) && typeof h.name === "string" ? [h.name] : [],
              )
            : [],
        } as PublicProviderConfig,
      ];
    }),
  );
};
