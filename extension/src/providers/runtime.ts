import { fail, isPlainObject } from "../security/validation.js";
import { ProviderSettings } from "../settings/provider-settings.js";
import { parseProviderBody } from "./provider-body.js";
import { ProviderPluginStore } from "./plugin-store.js";
import {
  handleProviderLifecycle,
  lifecycleKinds,
} from "./provider-lifecycle.js";
import { parseChatResponse } from "./provider-response.js";
import { ProviderRegistry } from "./registry.js";
import { testProvider } from "./provider-test.js";
import { CoreProviderTransport } from "./transport.js";
import type {
  ProviderChatResponse,
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
  private readonly pluginStore: ProviderPluginStore;
  private ready?: Promise<void>;

  public constructor(
    storage: ProviderRuntimeStorage,
    private readonly transport = new CoreProviderTransport(),
  ) {
    this.settings = new ProviderSettings({
      read: async () =>
        (await storage.get("provider_settings")).provider_settings,
      write: async (state) => storage.set({ provider_settings: state }),
    });
    this.pluginStore = new ProviderPluginStore(storage, this.registry);
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.pluginStore.load();
    await this.ready;
  }

  public async chat(
    input: { messages: ProviderMessage[]; tools?: ProviderToolDefinition[] },
    options: {
      onDelta?: (text: string) => void;
      signal?: AbortSignal;
      onProgress?: () => void;
    } = {},
  ): Promise<ProviderChatResponse> {
    await this.ensureReady();
    const config = await this.settings.active();
    const adapter = this.registry.resolveConfigured(config);
    const result = await this.transport.send(
      config,
      adapter,
      {
        wire_api: config.wire_api,
        model: config.model,
        messages: input.messages,
        ...(input.tools ? { tools: input.tools } : {}),
        stream: options.onDelta !== undefined,
      },
      options.signal,
    );
    try {
      const response = await parseProviderBody(
        result.body,
        options.onDelta,
        result.signal,
        options.onProgress,
      );
      return parseChatResponse(response);
    } finally {
      result.release();
    }
  }

  /**
   * Provider state that is safe to put in a diagnostics bundle.  The full
   * configuration is intentionally never a diagnostic value: API keys,
   * custom-header values, and endpoint URLs can all be credentials.
   */
  public async diagnostics(): Promise<Record<string, unknown>> {
    try {
      await this.ensureReady();
      const config = await this.settings.active();
      const publicConfig = {
        plugin_id: config.plugin_id,
        plugin_version: config.plugin_version,
        wire_api: config.wire_api,
        model: config.model,
        api_key_header: config.api_key_header,
        timeout_ms: config.timeout_ms,
        enabled: config.enabled,
        ...(config.private_network_opt_in === undefined
          ? {}
          : { private_network_opt_in: config.private_network_opt_in }),
        has_api_key: config.api_key.length > 0,
        custom_header_count: config.headers.length,
      };
      return {
        configured: true,
        config: publicConfig,
      };
    } catch {
      return { configured: false };
    }
  }

  public async handle(
    kind: string,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    await this.ensureReady();
    if (kind === "PROVIDER_LIST")
      return {
        ok: true,
        plugins: this.registry.snapshot(),
        providers: await this.settings.list(),
      };
    if (lifecycleKinds.has(kind))
      return handleProviderLifecycle(
        kind,
        payload,
        this.registry,
        this.pluginStore,
        this.settings,
      );
    if (kind === "PROVIDER_SAVE") return this.saveProvider(payload);
    if (kind === "PROVIDER_EXPORT")
      return { ok: true, export: await this.settings.exportPublic() };
    if (kind === "PROVIDER_TEST") return this.testProvider(payload);
    if (kind === "PROVIDER_MODELS") return this.listModels(payload);
    if (kind === "CHAT_SEND") return this.sendChat(payload);
    return fail("INVALID_ARGUMENT");
  }

  private async saveProvider(
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    const id = value.id;
    const config = isPlainObject(value.config)
      ? value.config
      : fail("INVALID_ARGUMENT");
    if (typeof id !== "string") fail("INVALID_ARGUMENT");
    this.registry.resolveConfigured(config);
    await this.settings.saveWriteOnly(id as string, config);
    return { ok: true, providers: await this.settings.list() };
  }

  private async testProvider(
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    return testProvider(payload, {
      resolveConfig: (id) => this.settings.resolve(id),
      resolveAdapter: (config) => this.registry.resolveConfigured(config),
      send: (config, adapter, request) =>
        this.transport.send(config, adapter, request),
    });
  }

  private async listModels(payload: unknown): Promise<Record<string, unknown>> {
    const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
    const id = value.id;
    if (typeof id !== "string") fail("INVALID_ARGUMENT");
    const config = await this.settings.resolve(id as string);
    this.registry.resolveConfigured(config);
    const result = await this.transport.listModels(config, "/models");
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
