import { fail } from "../security/validation.js";
import type {
  NormalizedProviderRequest,
  ProviderAdapter,
  ProviderMessage,
  ProviderRequestPlan,
  ProviderToolDefinition,
} from "./types.js";

const forbidden = new Set([
  "url",
  "headers",
  "api_key",
  "selector",
  "coordinates",
  "cdp_method",
  "execution_path",
]);
export const assertSafeRequestPlan = (plan: ProviderRequestPlan): void => {
  if (
    !["/chat/completions", "/responses"].includes(plan.path) ||
    Object.keys(plan.body).some((key) => forbidden.has(key))
  )
    fail("PROVIDER_PLUGIN_FAILED");
};

const responseTools = (
  tools: ProviderToolDefinition[] | undefined,
): Array<Record<string, unknown>> | undefined =>
  tools?.map((tool) => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));

const responseInput = (
  messages: ProviderMessage[],
): Array<Record<string, unknown>> =>
  messages.flatMap<Record<string, unknown>>((message) => {
    if (message.role === "tool")
      return message.tool_call_id
        ? [
            {
              type: "function_call_output",
              call_id: message.tool_call_id,
              output: message.content,
            },
          ]
        : [];
    const assistantContent =
      message.role === "assistant" && message.tool_calls?.length
        ? message.content
          ? [{ role: "assistant", content: message.content }]
          : []
        : [{ role: message.role, content: message.content }];
    const toolCalls =
      message.role === "assistant"
        ? (message.tool_calls ?? []).map((call) => ({
            type: "function_call",
            call_id: call.id,
            name: call.name,
            arguments: call.arguments,
          }))
        : [];
    return [...assistantContent, ...toolCalls];
  });

export const openAiCompatibleAdapter: ProviderAdapter = {
  id: "contextpilot.openai-compatible",
  plan(request: NormalizedProviderRequest): ProviderRequestPlan {
    const plan: ProviderRequestPlan =
      request.wire_api === "chat_completions"
        ? {
            path: "/chat/completions",
            body: {
              model: request.model,
              messages: request.messages,
              ...(request.tools ? { tools: request.tools } : {}),
              stream: request.stream,
            },
          }
        : {
            path: "/responses",
            body: {
              model: request.model,
              input: responseInput(request.messages),
              ...(request.tools ? { tools: responseTools(request.tools) } : {}),
              stream: request.stream,
            },
          };
    assertSafeRequestPlan(plan);
    return plan;
  },
};
