import type { ProviderMessage } from "../providers/types.js";

/** Rejected assessment calls still need a matching result before the next turn. */
export const settledAssessmentTranscript = (
  messages: readonly ProviderMessage[],
): ProviderMessage[] => {
  const settled: ProviderMessage[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    settled.push(message);
    if (message.role !== "assistant" || !message.tool_calls?.length) continue;
    let end = index + 1;
    while (end < messages.length && messages[end]?.role === "tool") end++;
    const results = new Set(
      messages.slice(index + 1, end).map((result) => result.tool_call_id),
    );
    settled.push(...messages.slice(index + 1, end));
    for (const call of message.tool_calls)
      if (!results.has(call.id))
        settled.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            status: "FAILED",
            code: "INVALID_ARGUMENT",
            reason: "ASSESSMENT_NOT_ACCEPTED",
            hint: "The assessment could not be accepted. No action was repeated; the typed execution result remains unchanged.",
          }),
        });
    index = end - 1;
  }
  return settled;
};
