import { traceDecision } from "../diagnostics/method-trace.js";
import { digestCanonical } from "../security/canonical.js";
import { developmentDiagnostics } from "../diagnostics/privacy-mode.js";
import type {
  ProviderChatResponse,
  ProviderConfig,
  NormalizedProviderRequest,
  ProviderMessage,
  ProviderToolDefinition,
} from "./types.js";

export type ProviderCallTrace = {
  provider_call_id: string;
  provider_id: string;
  model: string;
  wire_api: string;
  phase: string;
};

const responseCalls = new WeakMap<object, ProviderCallTrace>();

export const providerDiagnosticConfig = (config: ProviderConfig) =>
  developmentDiagnostics()
    ? config
    : {
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

/** Carry local diagnostics through response projections without model-visible fields. */
export const inheritProviderCallTrace = <T extends object>(
  original: object,
  projected: T,
): T => {
  const trace = responseCalls.get(original);
  if (trace) responseCalls.set(projected, trace);
  return projected;
};

export const traceProviderCallEvent = (
  trace: ProviderCallTrace,
  event: string,
  detail: Record<string, unknown> = {},
): void =>
  traceDecision(`provider.call.${event}:${trace.provider_call_id}`, {
    ...trace,
    ...detail,
  });

export const normalizedProviderRequest = (
  config: ProviderConfig,
  messages: ProviderMessage[],
  tools: ProviderToolDefinition[] | undefined,
  mutationStopped: boolean,
  stream: boolean,
): NormalizedProviderRequest => ({
  wire_api: config.wire_api,
  model: config.model,
  messages,
  ...(tools
    ? {
        tools: mutationStopped
          ? tools.filter(
              (tool) =>
                !tool.function.name.startsWith("propose_") &&
                tool.function.name !== "submit_plan",
            )
          : tools,
      }
    : {}),
  stream,
});

export const createProviderCallTrace = (
  config: ProviderConfig,
  phase = "unspecified",
): ProviderCallTrace => ({
  provider_call_id: crypto.randomUUID(),
  provider_id: config.plugin_id,
  model: config.model,
  wire_api: config.wire_api,
  phase,
});

export const traceProviderRequest = (
  trace: ProviderCallTrace,
  request: NormalizedProviderRequest,
): void =>
  traceProviderCallEvent(trace, "requested", {
    ...(developmentDiagnostics() ? { request } : {}),
    operation:
      request.wire_api === "responses" ? "/responses" : "/chat/completions",
    stream: request.stream,
    messages: request.messages.map(({ role, content, image_data_urls }) => ({
      role,
      char_count: content.length,
      digest: digestCanonical(content),
      image_count: image_data_urls?.length ?? 0,
    })),
    tools: request.tools?.map((tool) => tool.function.name) ?? [],
  });

export const traceProviderResponse = (
  trace: ProviderCallTrace,
  response: ProviderChatResponse,
): void => {
  responseCalls.set(response, trace);
  traceProviderCallEvent(trace, "parsed_response", {
    ...(developmentDiagnostics() ? { response } : {}),
    response_char_count: response.content.length,
    response_digest: digestCanonical(response.content),
    finish_reason: response.finish_reason ?? "unspecified",
    tool_calls: response.tool_calls.map((call) => ({
      name: call.name,
      argument_char_count: call.arguments.length,
      argument_digest: digestCanonical(call.arguments),
    })),
  });
};

export const providerCallId = (
  response: ProviderChatResponse,
): string | undefined => responseCalls.get(response)?.provider_call_id;

export const traceProviderHandling = (
  response: ProviderChatResponse,
  handling: Record<string, unknown>,
): void => {
  const trace = responseCalls.get(response);
  if (trace) {
    traceProviderCallEvent(trace, "response_handled", {
      handling,
    });
  }
};
