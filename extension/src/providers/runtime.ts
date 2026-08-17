import { ProviderRegistry } from "./registry.js";
import { CoreProviderTransport } from "./transport.js";
import { ProviderSettings } from "../settings/provider-settings.js";
import { fail, isPlainObject } from "../security/validation.js";
import type {
  NormalizedProviderRequest,
  ProviderChatResponse,
  ProviderConfig,
  ProviderMessage,
  ProviderToolCall,
  ProviderToolDefinition,
} from "./types.js";

export type ProviderRuntimeStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};

export class ProviderRuntime {
  public readonly registry = new ProviderRegistry();
  private readonly settings: ProviderSettings;
  public constructor(
    storage: ProviderRuntimeStorage,
    private readonly transport = new CoreProviderTransport(),
  ) {
    this.settings = new ProviderSettings({
      read: async () =>
        (await storage.get("provider_settings")).provider_settings,
      write: async (state) => storage.set({ provider_settings: state }),
    });
  }

  public async chat(input: {
    messages: ProviderMessage[];
    tools?: ProviderToolDefinition[];
  }): Promise<ProviderChatResponse> {
    const config = await this.settings.active();
    const resolved = this.registry.resolve(
      config.plugin_id,
      config.plugin_version,
    );
    console.debug("[ContextPilot][LLM provider dispatch]", {
      provider: config.label,
      base_url: config.base_url,
      wire_api: config.wire_api,
      model: config.model,
      message_count: input.messages.length,
      tool_names: input.tools?.map((tool) => tool.function.name) ?? [],
    });
    const result = await this.transport.send(config, resolved.adapter, {
      wire_api: config.wire_api,
      model: config.model,
      messages: input.messages,
      ...(input.tools ? { tools: input.tools } : {}),
      stream: false,
    });
    if (!result.body) fail("PROVIDER_UNAVAILABLE");
    let response: unknown;
    try {
      response = JSON.parse(await new Response(result.body).text());
    } catch {
      return fail("PROVIDER_UNAVAILABLE");
    }
    console.debug("[ContextPilot][LLM response raw]", {
      status: result.status,
      response: structuredClone(response),
    });
    return parseChatResponse(response);
  }

  public async handle(
    kind: string,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    if (kind === "PROVIDER_LIST")
      return {
        ok: true,
        plugins: this.registry.snapshot(),
        providers: await this.settings.list(),
      };
    if (kind === "PLUGIN_INSTALL") {
      const installed = this.registry.install(payload);
      return { ok: true, plugin: installed };
    }
    if (kind === "PLUGIN_SET_ENABLED") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (
        typeof value.plugin_id !== "string" ||
        typeof value.enabled !== "boolean"
      )
        fail("INVALID_ARGUMENT");
      this.registry.setEnabled(
        value.plugin_id as string,
        value.enabled as boolean,
      );
      await this.settings.setEnabledByPlugin(
        value.plugin_id as string,
        value.enabled as boolean,
      );
      return { ok: true };
    }
    if (kind === "PROVIDER_SAVE") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (typeof value.id !== "string" || !isPlainObject(value.config))
        fail("INVALID_ARGUMENT");
      await this.settings.save(
        value.id as string,
        value.config as unknown as ProviderConfig,
      );
      return { ok: true, providers: await this.settings.list() };
    }
    if (kind === "PROVIDER_EXPORT")
      return { ok: true, export: await this.settings.exportPublic() };
    if (kind === "PROVIDER_TEST") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (typeof value.id !== "string" || !isPlainObject(value.request))
        fail("INVALID_ARGUMENT");
      const config = await this.settings.resolve(value.id as string);
      const resolved = this.registry.resolve(
        config.plugin_id,
        config.plugin_version,
      );
      const result = await this.transport.send(
        config,
        resolved.adapter,
        value.request as unknown as NormalizedProviderRequest,
      );
      return { ok: true, status: result.status };
    }
    if (kind === "PROVIDER_MODELS") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (typeof value.id !== "string") fail("INVALID_ARGUMENT");
      const config = await this.settings.resolve(value.id as string);
      const result = await this.transport.listModels(config, "/models");
      return { ok: true, status: result.status, models: result.models };
    }
    if (kind === "CHAT_SEND") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (
        typeof value.prompt !== "string" ||
        value.prompt.length === 0 ||
        value.prompt.length > 8_000
      )
        fail("INVALID_ARGUMENT");
      const response = await this.chat({
        messages: [{ role: "user", content: value.prompt as string }],
      });
      if (response.tool_calls.length > 0 || !response.content)
        fail("PROVIDER_UNAVAILABLE");
      return { ok: true, message: response.content };
    }
    return fail("INVALID_ARGUMENT");
  }
}

const parseToolCalls = (value: unknown): ProviderToolCall[] => {
  if (!Array.isArray(value)) return [];
  const calls: ProviderToolCall[] = [];
  for (const candidate of value) {
    if (!isPlainObject(candidate)) continue;
    const functionValue = isPlainObject(candidate.function)
      ? candidate.function
      : candidate;
    if (
      typeof candidate.id !== "string" ||
      typeof functionValue.name !== "string" ||
      typeof functionValue.arguments !== "string"
    )
      continue;
    calls.push({
      id: candidate.id,
      name: functionValue.name,
      arguments: functionValue.arguments,
    });
  }
  return calls;
};

const parseChatResponse = (response: unknown): ProviderChatResponse => {
  const object = isPlainObject(response)
    ? response
    : fail("PROVIDER_UNAVAILABLE");
  const choices = object.choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = isPlainObject(first) && isPlainObject(first.message)
    ? first.message
    : undefined;
  if (message) {
    const content = typeof message.content === "string" ? message.content : "";
    const toolCalls = parseToolCalls(message.tool_calls);
    if (content || toolCalls.length > 0) return { content, tool_calls: toolCalls };
  }
  const output = typeof object.output_text === "string" ? object.output_text : "";
  const responseCalls = parseToolCalls(object.output);
  if (output || responseCalls.length > 0)
    return { content: output, tool_calls: responseCalls };
  return fail("PROVIDER_UNAVAILABLE");
};
