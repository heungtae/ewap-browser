import { ContractError, fail, isPlainObject } from "../security/validation.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";
import type { ProviderRuntime } from "../providers/runtime.js";
import type { ProviderMessage } from "../providers/types.js";
import type { ChatEventPayload } from "../contracts/chat-events.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import { providerCallId } from "../providers/provider-call-diagnostics.js";
export const primaryAnswerReview = async (
  provider: ProviderRuntime,
  prompt: string,
  answer: string,
  runId: string,
  publish: (id: string, event: ChatEventPayload) => void,
  context: RequestContext,
  thread?: ProviderMessage[],
): Promise<boolean> => {
  const messages: ProviderMessage[] = [
    ...(thread ?? []),
    { role: "assistant", content: answer },
    {
      role: "user",
      content: `Review the prepared answer against the ORIGINAL request: ${prompt}. Do not rewrite the answer or execute any action. Return exactly one submit_answer_review selecting accept or further_work. Only the prepared answer and supplied evidence count; do not infer full dataset coverage or business persistence. Prepared answer: ${answer}`,
    },
  ];
  const response = await provider.chat(
    {
      messages,
      tools: [
        {
          type: "function",
          function: {
            name: "submit_answer_review",
            description:
              "Select whether to publish the prepared answer unchanged, or investigate remaining work.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                verdict: { type: "string", enum: ["accept", "further_work"] },
              },
              required: ["verdict"],
            },
          },
        },
      ],
    },
    {
      phase: "result_acceptance",
      signal: context.signal,
      bindingSignal: context.signal,
      onProgress: () => context.progress?.("PROVIDER_BODY"),
      onRole: (event) =>
        publish(runId, { type: "provider_activity", ...event }),
    },
  );
  assertRequestActive(context);
  const call = response.tool_calls[0];
  if (
    response.tool_calls.length !== 1 ||
    !call?.id ||
    call.name !== "submit_answer_review" ||
    messages.some((m) => m.tool_call_id === call.id)
  ) {
    traceDecision("act.answer_review.rejected", {
      provider_call_id: providerCallId(response),
      reason: "invalid_tool_call_contract",
      tool_count: response.tool_calls.length,
      tool_names: response.tool_calls.map((item) => item.name),
    });
    return fail("PROVIDER_UNAVAILABLE", "invalid primary answer review");
  }
  let args: unknown;
  try {
    args = JSON.parse(call.arguments);
  } catch {
    traceDecision("act.answer_review.rejected", {
      provider_call_id: providerCallId(response),
      reason: "malformed_tool_arguments",
    });
    throw new ContractError("INVALID_ARGUMENT");
  }
  if (
    !isPlainObject(args) ||
    Object.keys(args).length !== 1 ||
    !["accept", "further_work"].includes(String(args.verdict))
  ) {
    traceDecision("act.answer_review.rejected", {
      provider_call_id: providerCallId(response),
      reason: "invalid_review_verdict",
    });
    return fail("INVALID_ARGUMENT");
  }
  // This is a real primary tool call; return its result under its original ID.
  thread?.push(
    { role: "assistant", content: answer },
    {
      role: "assistant",
      content: response.content,
      tool_calls: response.tool_calls,
    },
    {
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify({
        verdict: args.verdict,
        answer_published: false,
      }),
    },
  );
  traceDecision("act.answer_review.response", {
    provider_call_id: providerCallId(response),
    tool_name: call.name,
    verdict: args.verdict,
    answer_published: false,
  });
  return args.verdict === "accept";
};
