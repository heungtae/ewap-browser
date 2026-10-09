import type { ActSession, ActProposal } from "./act-session-types.js";
import type { ActionResult } from "../page-act-harness/outcome.js";
import { safeChatText } from "../state/tab-chat-session-store.js";

export type ActExecutionEvidence = ActionResult & {
  outcome: "VERIFIED" | "FAILED" | "UNKNOWN";
  code?: string;
  navigation: boolean;
  alreadySatisfied: boolean;
};

export const recordActExecution = (
  session: ActSession,
  proposal: ActProposal,
  executed: Record<string, unknown>,
): ActExecutionEvidence => {
  const outcome = executed.ok
    ? "VERIFIED"
    : executed.outcome === "UNKNOWN"
      ? "UNKNOWN"
      : "FAILED";
  const evidence: ActExecutionEvidence = {
    action_id: proposal.id,
    dispatched:
      executed.outcome !== "ALREADY_SATISFIED" &&
      executed.already_satisfied !== true,
    observed: outcome === "VERIFIED",
    verifier:
      outcome === "VERIFIED"
        ? "satisfied"
        : outcome === "FAILED"
          ? "failed"
          : "pending",
    outcome,
    ...(typeof executed.code === "string" ? { code: executed.code } : {}),
    navigation: proposal.tool === "navigate" || executed.navigation === true,
    alreadySatisfied:
      executed.outcome === "ALREADY_SATISFIED" ||
      executed.already_satisfied === true,
  };
  (session.executionEvidence ??= []).push(evidence);
  if (session.plan && outcome === "VERIFIED") session.plan.completedSteps += 1;
  session.messages.push({
    role: "tool",
    tool_call_id: proposal.toolCallId,
    content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({ ...evidence, tool: proposal.tool, target_name: safeChatText(proposal.targetName), verification_meaning: "ACTION_RESULT_NOT_GOAL_COMPLETION" })}\n[/UNTRUSTED_TOOL_RESULT]`,
  });
  if (outcome !== "VERIFIED") session.feedbackOnly = true;
  if (evidence.navigation) session.navigationFeedback = true;
  delete session.proposal;
  return evidence;
};
