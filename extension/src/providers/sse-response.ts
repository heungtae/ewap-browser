import { fail, isPlainObject } from "../security/validation.js";

type StreamedCall = { id: string; name: string; arguments: string };

const callKey = (value: Record<string, unknown>, index = 0): string =>
  typeof value.id === "string"
    ? value.id
    : typeof value.call_id === "string"
      ? value.call_id
      : String(index);

const callFor = (calls: Map<string, StreamedCall>, key: string): StreamedCall =>
  calls.get(key) ?? { id: key, name: "", arguments: "" };

export const parseSseProviderBody = (
  body: string,
  onDelta?: (text: string) => void,
  allowEmpty = false,
): unknown => {
  let content = "";
  const calls = new Map<string, StreamedCall>();
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
          const existing = callFor(calls, key);
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
      if (item.type === "function_call") {
        const key = callKey(item);
        calls.set(key, {
          id: key,
          name: typeof item.name === "string" ? item.name : "",
          arguments: typeof item.arguments === "string" ? item.arguments : "",
        });
      }
    }
    if (
      event.type === "response.function_call_arguments.delta" &&
      typeof event.delta === "string"
    ) {
      const key = callKey(event);
      const existing = callFor(calls, key);
      existing.arguments += event.delta;
      calls.set(key, existing);
    }
  }
  const toolCalls = [...calls.values()].filter(
    (call) => call.name && call.arguments,
  );
  if (!content && toolCalls.length === 0 && !allowEmpty)
    return fail("PROVIDER_UNAVAILABLE");
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
