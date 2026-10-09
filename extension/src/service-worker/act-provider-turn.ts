import type {
  ProviderChatResponse,
  ProviderMessage,
} from "../providers/types.js";
import { fail } from "../security/validation.js";

// A technical retry never repairs arguments or grants execution authority.
export const completeActProviderTurn = async (
  messages: ProviderMessage[],
  chat: () => Promise<ProviderChatResponse>,
): Promise<ProviderChatResponse> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await chat();
    let malformed = false;
    for (const call of response.tool_calls) {
      try {
        JSON.parse(call.arguments);
      } catch {
        malformed = true;
      }
    }
    const multipleActions =
      response.tool_calls.length > 1 &&
      response.tool_calls.some(
        (call) =>
          call.name.startsWith("propose_") ||
          [
            "submit_plan",
            "request_clarification",
            "report_goal_status",
          ].includes(call.name),
      );
    if (response.finish_reason !== "length" && !malformed && !multipleActions)
      return response;
    if (attempt === 1) return fail("INVALID_ARGUMENT");
    messages.push({
      role: "assistant",
      content: response.content,
      ...(response.tool_calls.length
        ? { tool_calls: response.tool_calls }
        : {}),
    });
    for (const call of response.tool_calls)
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          ok: false,
          code: "INVALID_ARGUMENT",
          reason:
            response.finish_reason === "length"
              ? "PROVIDER_OUTPUT_TRUNCATED"
              : multipleActions
                ? "MULTIPLE_ACTION_PROPOSALS"
                : "MALFORMED_TOOL_ARGUMENTS",
        }),
      });
    messages.push({
      role: "user",
      content:
        "Your previous response was incomplete, contained invalid JSON, or batched actions. No action was executed. For multiple actions, first submit_plan for user review; never batch action proposals. Resubmit one complete, concise tool call using the original request and offered schema. Preserve the exact requested value; do not guess, shorten or repeat it.",
    });
  }
  return fail("INVALID_ARGUMENT");
};
