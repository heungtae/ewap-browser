import { invalidateProviderWrite } from "./provider-write-binding.js";
import { ContractError, fail, isPlainObject } from "../security/validation.js";
import { developmentDiagnostics } from "../diagnostics/privacy-mode.js";
import { ProviderSettings } from "../settings/provider-settings.js";
import { parseProviderBody } from "./provider-body.js";
import { parseChatResponse } from "./provider-response.js";
import { resolveOpenAiCompatible } from "./resolve-openai-compatible.js";
import { handleManagement } from "./runtime-management.js";
import { ModelBindings } from "./model-bindings.js";
import { decide } from "./decision-coordinator.js";
import type { DecisionTask, ModelRequestOptions } from "./jev-types.js";
import { CoreProviderTransport } from "./transport.js";
import {
  createProviderCallTrace,
  normalizedProviderRequest,
  providerDiagnosticConfig,
  traceProviderCallEvent,
  traceProviderRequest,
  traceProviderResponse,
} from "./provider-call-diagnostics.js";
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
    let phase = "transport";
    const request = normalizedProviderRequest(
      config,
      input.messages,
      input.tools,
      binding?.mutationStopped ?? false,
      options.onDelta !== undefined,
    );
    const callTrace = createProviderCallTrace(config, options.phase);
    traceProviderRequest(callTrace, request);
    try {
      result = await this.transport.send(
        config,
        adapter,
        request,
        controller.signal,
        callTrace,
      );
      phase = "response_body";
      const response = await parseProviderBody(
        result.body,
        binding?.decision ? undefined : options.onDelta,
        result.signal,
        options.onProgress,
      );
      if (developmentDiagnostics())
        traceProviderCallEvent(callTrace, "body_received", { response });
      if (binding) this.bindings.check(binding);
      options.signal?.throwIfAborted();
      phase = "response_parse";
      const parsed = parseChatResponse(response);
      traceProviderResponse(callTrace, parsed);
      if (
        binding?.mutationStopped &&
        parsed.tool_calls.some(
          (c) => c.name.startsWith("propose_") || c.name === "submit_plan",
        )
      )
        return fail("POLICY_DENIED");
      return parsed;
    } catch (error) {
      const code =
        error instanceof ContractError ? error.code : "UNEXPECTED_ERROR";
      traceProviderCallEvent(callTrace, "processing_failed", {
        ...(developmentDiagnostics() ? { error } : {}),
        failed_stage: phase,
        code,
      });
      throw error;
    } finally {
      result?.release();
      for (const source of signals) source.removeEventListener("abort", abort);
    }
  }

  /** Release exports redact configuration; development exports keep captured values. */
  public async diagnostics(): Promise<Record<string, unknown>> {
    try {
      const config = await this.settings.active();
      return {
        configured: true,
        config: providerDiagnosticConfig(config),
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
