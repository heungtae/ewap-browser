import { invalidateProviderWrite } from "./provider-write-binding.js";
import { fail, isPlainObject } from "../security/validation.js";
import { ProviderSettings } from "../settings/provider-settings.js";
import { parseProviderBody } from "./provider-body.js";
import { parseChatResponse } from "./provider-response.js";
import { resolveOpenAiCompatible } from "./resolve-openai-compatible.js";
import { handleManagement } from "./runtime-management.js";
import { ModelBindings } from "./model-bindings.js";
import { decide } from "./decision-coordinator.js";
import type { DecisionTask, ModelRequestOptions } from "./jev-types.js";
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
  private readonly settings: ProviderSettings;
  public readonly bindings: ModelBindings;

  public constructor(
    storage: ProviderRuntimeStorage,
    private readonly transport = new CoreProviderTransport(),
  ) {
    this.settings = new ProviderSettings({
      read: async () =>
        (await storage.get("provider_settings")).provider_settings,
      write: async (state) => {
        await invalidateProviderWrite(
          this.bindings,
          (await storage.get("provider_settings")).provider_settings,
          state,
        );
        await storage.set({ provider_settings: state });
      },
    });
    this.bindings = new ModelBindings(this.settings);
  }

  public decide(task: DecisionTask, options: ModelRequestOptions) {
    return decide(this.bindings, this.transport, task, options);
  }

  public async chat(
    input: { messages: ProviderMessage[]; tools?: ProviderToolDefinition[] },
    options: ModelRequestOptions = {},
  ): Promise<ProviderChatResponse> {
    const bindingSignal = options.bindingSignal ?? options.signal;
    const binding = bindingSignal
      ? await this.bindings.get(bindingSignal)
      : undefined;
    if (binding) this.bindings.check(binding);
    const config = binding?.primary ?? (await this.settings.active());
    if (binding?.decision)
      options.onRole?.({
        provider_role: "primary",
        stage: "PROCESSING",
        phase: options.phase ?? "primary_processing",
      });
    const controller = new AbortController();
    const signals = [options.signal, binding?.controller.signal].filter(
      (s): s is AbortSignal => !!s,
    );
    const abort = () => controller.abort();
    for (const source of signals) {
      source.addEventListener("abort", abort, { once: true });
      if (source.aborted) abort();
    }
    const adapter = resolveOpenAiCompatible(config);
    let result: Awaited<ReturnType<CoreProviderTransport["send"]>> | undefined;
    try {
      result = await this.transport.send(
        config,
        adapter,
        {
          wire_api: config.wire_api,
          model: config.model,
          messages: input.messages,
          ...(input.tools
            ? {
                tools: binding?.mutationStopped
                  ? input.tools.filter(
                      (t) =>
                        !t.function.name.startsWith("propose_") &&
                        t.function.name !== "submit_plan",
                    )
                  : input.tools,
              }
            : {}),
          stream: options.onDelta !== undefined,
        },
        controller.signal,
      );
      const response = await parseProviderBody(
        result.body,
        binding?.decision ? undefined : options.onDelta,
        result.signal,
        options.onProgress,
      );
      if (binding) this.bindings.check(binding);
      options.signal?.throwIfAborted();
      const parsed = parseChatResponse(response);
      if (
        binding?.mutationStopped &&
        parsed.tool_calls.some(
          (c) => c.name.startsWith("propose_") || c.name === "submit_plan",
        )
      )
        return fail("POLICY_DENIED");
      return parsed;
    } finally {
      result?.release();
      for (const source of signals) source.removeEventListener("abort", abort);
    }
  }

  /**
   * Provider state that is safe to put in a diagnostics bundle.  The full
   * configuration is intentionally never a diagnostic value: API keys,
   * custom-header values, and endpoint URLs can all be credentials.
   */
  public async diagnostics(): Promise<Record<string, unknown>> {
    try {
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
    if (kind === "CHAT_SEND") return this.sendChat(payload);
    return handleManagement(kind, payload, this.settings, this.transport);
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
