import { isPlainObject } from "../security/validation.js";
import {
  maxProviderAssistantChars,
  providerResponseTooLarge,
} from "./response-limits.js";
import type { ProviderChatResponse, ProviderToolCall } from "./types.js";
import { fail } from "../security/validation.js";

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
