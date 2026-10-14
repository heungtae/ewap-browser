import { isPlainObject } from "../security/validation.js";
import { advancePlanStep } from "./page-method-plan.js";
import { mutationBinding } from "./act-mutation-history.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import type { PageScope } from "../state/tab-chat-session-store.js";
import { recordLocalGoal } from "./act-local-goal.js";
import type { ActSession, ActProposal } from "./act-session-types.js";
import { safeChatText } from "../state/tab-chat-session-store.js";

export type { ActExecutionEvidence } from "./act-execution-evidence.js";
import type { ActExecutionEvidence } from "./act-execution-evidence.js";

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
  const dispatch =
    executed.dispatch === "dispatched" || executed.dispatch === "not_dispatched"
      ? executed.dispatch
      : "unknown";
  const evidence: ActExecutionEvidence = {
    ...(executed.navigation_binding
      ? {
          navigation_binding: executed.navigation_binding as NonNullable<
            ActExecutionEvidence["navigation_binding"]
          >,
        }
      : {}),
    ...mutationBinding(session, proposal, session.assessmentBaseline),
    dispatch,
    ...(proposal.tool === "call_page_method"
      ? {
          page_method_invocation:
            executed.invocation as import("../contracts/page-method-types.js").PageMethodResult["invocation"],
        }
      : {}),
    logical_step_id:
      session.recoveryStep?.logicalStepId ??
      (session.plan
        ? `${session.plan.input.plan_id}:${session.plan.revision}:${session.plan.nextStep ?? session.plan.completedSteps}`
        : proposal.id),
    raw_outcome: outcome,
    ...(outcome === "VERIFIED"
      ? { confirmation: "local_verifier" as const }
      : {}),
    action_id: proposal.id,
    dispatched: dispatch === "dispatched",
    ...(outcome === "VERIFIED" && dispatch === "unknown"
      ? { stateSatisfied: true }
      : {}),
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
  const operation =
    proposal.tool === "call_page_method"
      ? "method-rediscovery"
      : proposal.tool === "navigate"
        ? "navigate"
        : proposal.tool === "set_text_by_ref"
          ? "set-text"
          : proposal.tool === "select_option_by_ref"
            ? "select"
            : proposal.tool === "set_checked_by_ref"
              ? "check"
              : "click";
  if (["call_page_api", "press_key_by_ref"].includes(proposal.tool))
    session.learnedProfile?.failure();
  session.learnedProfile?.action(
    {
      channel: proposal.tool === "call_page_method" ? "method" : "ui",
      operation,
    },
    outcome === "VERIFIED" ||
      (proposal.tool === "call_page_method" &&
        executed.dispatch === "dispatched" &&
        executed.invocation === "returned" &&
        isPlainObject(executed.return_data) &&
        executed.return_data.available === true),
    dispatch === "not_dispatched" && outcome === "FAILED",
  );
  traceDecision("act.dispatch.receipt", {
    logical_step_id: evidence.logical_step_id,
    attempt_id: evidence.action_id,
    dispatch: evidence.dispatch,
    raw_outcome: evidence.raw_outcome,
    observed: evidence.observed,
    already_satisfied: evidence.alreadySatisfied,
  });
  recordLocalGoal(
    session,
    proposal,
    evidence,
    executed.verified_scope as PageScope | undefined,
  );
  if (
    session.plan &&
    (outcome === "VERIFIED" ||
      (proposal.tool === "call_page_method" &&
        executed.dispatch === "dispatched" &&
        executed.invocation === "returned"))
  )
    advancePlanStep(session.plan, outcome === "VERIFIED");
  session.messages.push({
    role: "tool",
    tool_call_id: proposal.toolCallId,
    content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({
      ...evidence,
      tool: proposal.tool,
      target_name: safeChatText(proposal.targetName),
      verification_meaning: "ACTION_RESULT_NOT_GOAL_COMPLETION",
      ...(proposal.tool === "call_page_method" && executed.return_data
        ? { return_data: executed.return_data }
        : {}),
      ...(proposal.tool === "call_page_method"
        ? { invocation: executed.invocation, dispatch: executed.dispatch }
        : {}),
    })}\n[/UNTRUSTED_TOOL_RESULT]`,
  });
  const recovering = session.recoveryStep?.attempts === 1;
  const recoverable =
    outcome === "FAILED" &&
    dispatch === "not_dispatched" &&
    ["TARGET_NOT_ACTIONABLE", "TARGET_STALE"].includes(String(executed.code)) &&
    !session.recoveryStep;
  if (recoverable) {
    session.recoveryStep = {
      logicalStepId: evidence.logical_step_id!,
      attempts: 0,
    };
    delete session.continueAfterApproval;
    session.messages.push({
      role: "user",
      content:
        "This attempt was rejected BEFORE dispatch. You may propose at most one supported alternative for the SAME logical step, using the fresh observation and a new single-step approval. Preserve the original plan and failed attempt; do not retry a dispatched or unknown mutation.",
    });
  }
  const returnedPageMethod =
    proposal.tool === "call_page_method" &&
    executed.dispatch === "dispatched" &&
    executed.invocation === "returned";
  if (outcome !== "VERIFIED" && !recoverable && !returnedPageMethod) {
    session.feedbackOnly = true;
    if (outcome === "UNKNOWN") session.pendingAssessment = proposal;
  }
  if (evidence.navigation && outcome === "VERIFIED")
    session.navigationFeedback = true;
  if (recovering) delete session.recoveryStep;
  delete session.proposal;
  return evidence;
};
