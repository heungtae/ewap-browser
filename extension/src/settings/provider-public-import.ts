export type PublicProvider = {
  plugin_id: string;
  plugin_version: string;
  label: string;
  base_url: string;
  model: string;
  wire_api: "chat_completions" | "responses";
  api_key_header: string;
  header_names: string[];
  has_api_key: boolean;
  enabled: boolean;
  private_network_opt_in?: boolean;
};

const plain = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const allowed = new Set([
  "plugin_id",
  "plugin_version",
  "label",
  "base_url",
  "wire_api",
  "model",
  "api_key_header",
  "header_names",
  "has_api_key",
  "timeout_ms",
  "enabled",
  "private_network_opt_in",
]);

export const parsePublicProviderImport = (
  input: unknown,
): { id: string; config: PublicProvider } => {
  if (
    !plain(input) ||
    input.schema_version !== 1 ||
    !plain(input.providers) ||
    Object.keys(input).some(
      (key) =>
        !["schema_version", "providers", "active_provider"].includes(key),
    )
  )
    throw new Error("공개 설정 형식이 올바르지 않습니다.");
  const entries = Object.entries(input.providers);
  if (entries.length !== 1)
    throw new Error("Provider 한 개의 공개 설정을 선택하세요.");
  const [id, value] = entries[0]!;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id) ||
    !plain(value) ||
    Object.keys(value).some((key) => !allowed.has(key)) ||
    typeof value.plugin_id !== "string" ||
    typeof value.plugin_version !== "string" ||
    typeof value.label !== "string" ||
    typeof value.base_url !== "string" ||
    typeof value.model !== "string" ||
    (value.wire_api !== "responses" && value.wire_api !== "chat_completions") ||
    typeof value.api_key_header !== "string" ||
    !Array.isArray(value.header_names) ||
    value.header_names.some((name: unknown) => typeof name !== "string") ||
    typeof value.has_api_key !== "boolean" ||
    typeof value.enabled !== "boolean" ||
    !Number.isInteger(value.timeout_ms) ||
    (value.private_network_opt_in !== undefined &&
      typeof value.private_network_opt_in !== "boolean")
  )
    throw new Error("secret 없는 Provider 공개 설정만 가져올 수 있습니다.");
  return { id, config: value as PublicProvider };
};
