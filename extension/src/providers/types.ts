export const AUTH_SCHEMES = [
  "none",
  "authorization_bearer",
  "api-key",
  "x-goog-api-key",
] as const;
export type AuthScheme = (typeof AUTH_SCHEMES)[number];
export const WIRE_APIS = ["chat_completions", "responses"] as const;
export type WireApi = (typeof WIRE_APIS)[number];
export type ProviderPluginManifest = {
  schema_version: 1;
  plugin_id: string;
  plugin_version: string;
  api_version: 1;
  label: string;
  adapter_id: string;
  wire_apis: WireApi[];
  auth_schemes: AuthScheme[];
  default_base_url?: string;
};
export type ProviderConfig = {
  plugin_id: string;
  plugin_version: string;
  label: string;
  base_url: string;
  wire_api: WireApi;
  model: string;
  api_key: string;
  api_key_header: AuthScheme;
  headers: Array<{ name: string; value: string }>;
  timeout_ms: number;
  enabled: boolean;
  private_network_opt_in?: boolean;
};
export type PublicProviderConfig = Omit<
  ProviderConfig,
  "api_key" | "headers"
> & {
  has_api_key: boolean;
  header_names: string[];
};
export type NormalizedProviderRequest = {
  wire_api: WireApi;
  model: string;
  messages: ProviderMessage[];
  tools?: ProviderToolDefinition[];
  stream: boolean;
};
export type ProviderToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: string;
};
export type ProviderMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ProviderToolCall[];
  tool_call_id?: string;
};
export type ProviderChatResponse = {
  content: string;
  tool_calls: ProviderToolCall[];
};
export type ProviderRequestPlan = {
  path: "/chat/completions" | "/responses";
  body: Record<string, unknown>;
};
export type ProviderAdapter = {
  readonly id: string;
  plan(request: NormalizedProviderRequest): ProviderRequestPlan;
};
