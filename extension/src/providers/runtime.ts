import { fail, isPlainObject } from "../security/validation.js";
import { ProviderSettings } from "../settings/provider-settings.js";
import { parseProviderBody } from "./provider-body.js";
import { parseChatResponse } from "./provider-response.js";
import { ProviderRegistry } from "./registry.js";
import { testProvider } from "./provider-test.js";
import { CoreProviderTransport } from "./transport.js";
import type {
  ProviderChatResponse,
  ProviderConfig,
  ProviderMessage,
  ProviderToolDefinition,
} from "./types.js";

export {
  maxProviderAssistantChars,
  maxProviderBodyChars,
} from "./response-limits.js";

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

  public async chat(
    input: { messages: ProviderMessage[]; tools?: ProviderToolDefinition[] },
    options: { onDelta?: (text: string) => void } = {},
  ): Promise<ProviderChatResponse> {
    const config = await this.settings.active();
    const resolved = this.registry.resolve(
      config.plugin_id,
      config.plugin_version,
    );
    const result = await this.transport.send(config, resolved.adapter, {
      wire_api: config.wire_api,
      model: config.model,
      messages: input.messages,
      ...(input.tools ? { tools: input.tools } : {}),
      stream: options.onDelta !== undefined,
    });
    try {
      const response = await parseProviderBody(
        result.body,
        options.onDelta,
        result.signal,
      );
      return parseChatResponse(response);
    } finally {
      result.release();
    }
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
    if (kind === "PLUGIN_INSTALL")
      return { ok: true, plugin: this.registry.install(payload) };
    if (kind === "PLUGIN_SET_ENABLED") return this.setPluginEnabled(payload);
    if (kind === "PROVIDER_SAVE") return this.saveProvider(payload);
    if (kind === "PROVIDER_EXPORT")
      return { ok: true, export: await this.settings.exportPublic() };
    if (kind === "PROVIDER_TEST") return this.testProvider(payload);
    if (kind === "PROVIDER_MODELS") return this.listModels(payload);
    if (kind === "CHAT_SEND") return this.sendChat(payload);
    return fail("INVALID_ARGUMENT");
  }

  private async setPluginEnabled(
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    const pluginId = value.plugin_id;
    const enabled = value.enabled;
    if (typeof pluginId !== "string") fail("INVALID_ARGUMENT");
    if (typeof enabled !== "boolean") fail("INVALID_ARGUMENT");
    this.registry.setEnabled(pluginId as string, enabled as boolean);
    await this.settings.setEnabledByPlugin(
      pluginId as string,
      enabled as boolean,
    );
    return { ok: true };
  }

  private async saveProvider(
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    const id = value.id;
    const config = value.config;
    if (typeof id !== "string") fail("INVALID_ARGUMENT");
    if (!isPlainObject(config)) fail("INVALID_ARGUMENT");
    await this.settings.save(id as string, config as unknown as ProviderConfig);
    return { ok: true, providers: await this.settings.list() };
  }

  private async testProvider(
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return testProvider(payload, {
      resolveConfig: (id) => this.settings.resolve(id),
      resolveAdapter: (config) =>
        this.registry.resolve(config.plugin_id, config.plugin_version).adapter,
      send: (config, adapter, request) =>
        this.transport.send(config, adapter, request),
    });
  }

  private async listModels(payload: unknown): Promise<Record<string, unknown>> {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    const id = value.id;
    if (typeof id !== "string") fail("INVALID_ARGUMENT");
    const result = await this.transport.listModels(
      await this.settings.resolve(id as string),
      "/models",
    );
    return { ok: true, status: result.status, models: result.models };
  }

  private async sendChat(payload: unknown): Promise<Record<string, unknown>> {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    const prompt = value.prompt;
    if (
      typeof prompt !== "string" ||
      prompt.length === 0 ||
      prompt.length > 8_000
    )
      fail("INVALID_ARGUMENT");
    const response = await this.chat({
      messages: [{ role: "user", content: prompt as string }],
    });
    if (response.tool_calls.length > 0 || !response.content)
      fail("PROVIDER_UNAVAILABLE");
    return { ok: true, message: response.content };
  }
}
