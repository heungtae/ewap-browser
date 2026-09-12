import type { ChatEventPayload } from "../contracts/chat-events.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import type { Run } from "../state/run-coordinator.js";
import type { ActProposal, ActSession } from "./act-session-types.js";

type Outcome = "FAILED" | "UNKNOWN" | "VERIFIED";
type Execution = Record<string, unknown>;
type Dependencies = {
  publish(runId: string, event: ChatEventPayload): void;
  publishTerminal(run: Run, outcome: Outcome, code?: string): void;
  continueWorkflow(
    session: ActSession,
    proposal: ActProposal,
  ): Promise<Record<string, unknown>>;
  endSession(session: ActSession): void;
};

export const completeActProposal = async (
  dependencies: Dependencies,
  session: ActSession,
  run: Run,
  proposal: ActProposal,
  executed: Execution,
  summaries: { success: string; failure: string; unknown?: string },
): Promise<Record<string, unknown>> => {
  if (!executed.ok) {
    const code = typeof executed.code === "string" ? executed.code : undefined;
    const outcome: Outcome =
      executed.outcome === "UNKNOWN" ? "UNKNOWN" : "FAILED";
    dependencies.publish(run.id, {
      type: "tool_finished",
      tool_use_id: proposal.toolCallId,
      result: {
        outcome,
        summary:
          outcome === "UNKNOWN"
            ? (summaries.unknown ?? summaries.failure)
            : summaries.failure,
        ...(code ? { code } : {}),
      },
    });
    dependencies.publishTerminal(run, outcome, code);
    return executed;
  }
  dependencies.publish(run.id, {
    type: "tool_finished",
    tool_use_id: proposal.toolCallId,
    result: { outcome: "VERIFIED", summary: summaries.success },
  });
  dependencies.publishTerminal(run, "VERIFIED");
  session.messages.push({
    role: "tool",
    tool_call_id: proposal.toolCallId,
    content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({
      outcome: "VERIFIED",
      tool: proposal.tool,
      target_name: safeChatText(proposal.targetName),
    })}\n[/UNTRUSTED_TOOL_RESULT]`,
  });
  delete session.proposal;
  if (proposal.tool === "navigate") {
    dependencies.endSession(session);
    return { ok: true, outcome: "VERIFIED" };
  }
  return dependencies.continueWorkflow(session, proposal);
};
