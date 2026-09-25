import { isPlainObject } from "../security/validation.js";
import {
  maxProviderAssistantChars,
  providerResponseTooLarge,
} from "./response-limits.js";
import type { ProviderChatResponse, ProviderToolCall } from "./types.js";
import { fail } from "../security/validation.js";

const browserAuthorityFields = new Set([
  "cdp_method",
  "selector",
  "coordinates",
  "execution_path",
  "backend_node_id",
]);
export const rejectBrowserAuthority = (value: unknown, depth = 0): void => {
  if (depth > 16) fail("PROVIDER_UNAVAILABLE");
  if (Array.isArray(value)) {
    for (const item of value) rejectBrowserAuthority(item, depth + 1);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (browserAuthorityFields.has(key.toLowerCase()))
      fail("PROVIDER_PLUGIN_FAILED");
    rejectBrowserAuthority(item, depth + 1);
  }
};

const parseToolCalls = (value: unknown): ProviderToolCall[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isPlainObject(candidate)) return [];
    const functionValue = isPlainObject(candidate.function)
      ? candidate.function
      : candidate;
    const id =
      typeof candidate.call_id === "string" ? candidate.call_id : candidate.id;
    if (
      typeof id !== "string" ||
      typeof functionValue.name !== "string" ||
      typeof functionValue.arguments !== "string"
    )
      return [];
    return [
      { id, name: functionValue.name, arguments: functionValue.arguments },
    ];
  });
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

export const parseChatResponse = (response: unknown): ProviderChatResponse => {
  rejectBrowserAuthority(response);
  const object = isPlainObject(response)
    ? response
    : fail("PROVIDER_UNAVAILABLE");
  const first = Array.isArray(object.choices) ? object.choices[0] : undefined;
  const message =
    isPlainObject(first) && isPlainObject(first.message)
      ? first.message
      : undefined;
  if (message) {
    const content = typeof message.content === "string" ? message.content : "";
    const toolCalls = parseToolCalls(message.tool_calls);
    if (content.length > maxProviderAssistantChars) providerResponseTooLarge();
    if (content || toolCalls.length > 0)
      return { content, tool_calls: toolCalls };
  }
  const output =
    typeof object.output_text === "string"
      ? object.output_text
      : responseOutputText(object.output);
  const responseCalls = parseToolCalls(object.output);
  if (output.length > maxProviderAssistantChars) providerResponseTooLarge();
  if (output || responseCalls.length > 0)
    return { content: output, tool_calls: responseCalls };
  return fail("PROVIDER_UNAVAILABLE");
};
