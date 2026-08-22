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

  public async chat(
    input: {
      messages: ProviderMessage[];
      tools?: ProviderToolDefinition[];
    },
    options: { onDelta?: (text: string) => void } = {},
  ): Promise<ProviderChatResponse> {
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
      stream: options.onDelta !== undefined,
    });
    const response = await parseProviderBody(result.body, options.onDelta);
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
      parseChatResponse(await parseProviderBody(result.body));
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
    const id =
      typeof candidate.call_id === "string"
        ? candidate.call_id
        : typeof candidate.id === "string"
          ? candidate.id
          : undefined;
    if (
      !id ||
      typeof functionValue.name !== "string" ||
      typeof functionValue.arguments !== "string"
    )
      continue;
    calls.push({
      id,
      name: functionValue.name,
      arguments: functionValue.arguments,
    });
  }
  return calls;
};

const parseProviderBody = async (
  body: ReadableStream<Uint8Array> | null,
  onDelta?: (text: string) => void,
): Promise<unknown> => {
  if (!body) return fail("PROVIDER_UNAVAILABLE");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let pending = "";
  let isSse = false;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    const chunk = decoder.decode(next.value, { stream: true });
    text += chunk;
    pending += chunk;
    let newline = pending.indexOf("\n");
    while (newline >= 0) {
      const line = pending.slice(0, newline).replace(/\r$/, "");
      pending = pending.slice(newline + 1);
      if (line.startsWith("data:")) {
        isSse = true;
        // Parse each completed event now for UI deltas; the complete body is
        // parsed below to assemble fragmented tool calls exactly once.
        parseSseProviderBody(line, onDelta);
      }
      newline = pending.indexOf("\n");
    }
  }
  text += decoder.decode();
  if (isSse || text.split(/\r?\n/).some((line) => line.startsWith("data:")))
    return parseSseProviderBody(text);
  try {
    return JSON.parse(text);
  } catch {
    return fail("PROVIDER_UNAVAILABLE");
  }
};

const parseSseProviderBody = (
  body: string,
  onDelta?: (text: string) => void,
): unknown => {
  let content = "";
  const calls = new Map<
    string,
    { id: string; name: string; arguments: string }
  >();
  const callKey = (value: Record<string, unknown>, index = 0): string =>
    typeof value.id === "string"
      ? value.id
      : typeof value.call_id === "string"
        ? value.call_id
        : String(index);
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    let event: unknown;
    try {
      event = JSON.parse(payload);
    } catch {
      return fail("PROVIDER_UNAVAILABLE");
    }
    if (!isPlainObject(event)) continue;
    const choice = Array.isArray(event.choices) ? event.choices[0] : undefined;
    const delta =
      isPlainObject(choice) && isPlainObject(choice.delta)
        ? choice.delta
        : undefined;
    if (delta) {
      if (typeof delta.content === "string") {
        content += delta.content;
        onDelta?.(delta.content);
      }
      if (Array.isArray(delta.tool_calls))
        for (const [index, raw] of delta.tool_calls.entries()) {
          if (!isPlainObject(raw)) continue;
          const key = callKey(raw, index);
          const functionValue = isPlainObject(raw.function)
            ? raw.function
            : raw;
          const existing = calls.get(key) ?? {
            id: key,
            name: "",
            arguments: "",
          };
          if (typeof functionValue.name === "string")
            existing.name = functionValue.name;
          if (typeof functionValue.arguments === "string")
            existing.arguments += functionValue.arguments;
          calls.set(key, existing);
        }
    }
    if (
      event.type === "response.output_text.delta" &&
      typeof event.delta === "string"
    ) {
      content += event.delta;
      onDelta?.(event.delta);
    }
    if (
      event.type === "response.output_item.added" &&
      isPlainObject(event.item)
    ) {
      const item = event.item;
      if (item.type !== "function_call") continue;
      const key = callKey(item);
      calls.set(key, {
        id: key,
        name: typeof item.name === "string" ? item.name : "",
        arguments: typeof item.arguments === "string" ? item.arguments : "",
      });
    }
    if (
      event.type === "response.function_call_arguments.delta" &&
      typeof event.delta === "string"
    ) {
      const key = callKey(event);
      const existing = calls.get(key) ?? { id: key, name: "", arguments: "" };
      existing.arguments += event.delta;
      calls.set(key, existing);
    }
  }
  const toolCalls = [...calls.values()].filter(
    (call) => call.name && call.arguments,
  );
  if (!content && toolCalls.length === 0) return fail("PROVIDER_UNAVAILABLE");
  return {
    choices: [
      {
        message: {
          content,
          ...(toolCalls.length
            ? {
                tool_calls: toolCalls.map((call) => ({
                  id: call.id,
                  function: { name: call.name, arguments: call.arguments },
                })),
              }
            : {}),
        },
      },
    ],
  };
};

const responseOutputText = (output: unknown): string => {
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item) => {
      if (!isPlainObject(item) || !Array.isArray(item.content)) return [];
      return item.content.flatMap((content) =>
        isPlainObject(content) &&
        content.type === "output_text" &&
        typeof content.text === "string"
          ? [content.text]
          : [],
      );
    })
    .join("");
};

const parseChatResponse = (response: unknown): ProviderChatResponse => {
  const object = isPlainObject(response)
    ? response
    : fail("PROVIDER_UNAVAILABLE");
  const choices = object.choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message =
    isPlainObject(first) && isPlainObject(first.message)
      ? first.message
      : undefined;
  if (message) {
    const content = typeof message.content === "string" ? message.content : "";
    const toolCalls = parseToolCalls(message.tool_calls);
    if (content || toolCalls.length > 0)
      return { content, tool_calls: toolCalls };
  }
  const output =
    typeof object.output_text === "string"
      ? object.output_text
      : responseOutputText(object.output);
  const responseCalls = parseToolCalls(object.output);
  if (output || responseCalls.length > 0)
    return { content: output, tool_calls: responseCalls };
  return fail("PROVIDER_UNAVAILABLE");
};
