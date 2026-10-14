import { logicalActionResults } from "./act-logical-results.js";
import { isErrorCode } from "../contracts/error-codes.js";
import type { ActCompletion } from "../contracts/act-completion.js";
import {
  classifyOutcome,
  toLegacyOutcome,
} from "../page-act-harness/outcome.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import type { ActSession } from "./act-session-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { Run } from "../state/run-coordinator.js";

export const actionOutcome = (
  session: ActSession,
): ActCompletion["action_outcome"] => {
  const actions = logicalActionResults(session.executionEvidence ?? []);
  if (actions.some((a) => a.verifier === "failed" || a.outcome === "FAILED"))
    return "FAILED";
  return actions.length &&
    actions.every((a) => a.verifier === "satisfied" && a.observed)
    ? "VERIFIED"
    : "UNKNOWN";
};
export const checkingCompletion = (
  session: ActSession,
  reassessments = 0,
): ActCompletion => ({
  action_outcome: actionOutcome(session),
  goal_status: "checking",
  reason: "OBSERVING",
  reassessments,
});
export const finaliseGoal = (opts: {
  dependencies: ActStepDependencies;
  session: ActSession;
  run: Run;
  status: "completed" | "incomplete" | "unknown";
  summary: string;
  current: boolean;
  reassessments: number;
  reason?: ActCompletion["reason"];
}): Record<string, unknown> => {
  const { dependencies, session, run } = opts;
  const actions = logicalActionResults(session.executionEvidence ?? []);
  const action = actionOutcome(session);
  const verified = actions.filter((a) => a.verifier === "satisfied").length;
  // A validated report about the current observation decides goal completion.
  // Local action receipts remain unchanged, including UNKNOWN/FAILED history.
  const providerCompleted = opts.current && opts.status === "completed";
  const terminal = providerCompleted
    ? { kind: "GOAL_VERIFIED" as const, reason: "PROVIDER_COMPLETED" }
    : classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions,
        binding_current: opts.current,
        goal: {
          required_actions: Math.max(
            session.requiredGoalActions ?? 0,
            session.plan?.input.steps.length ?? actions.length,
          ),
          verified_actions: session.plan
            ? Math.min(verified, session.plan.completedSteps)
            : verified,
          final_observation: opts.current,
          goal_met: opts.status === "completed",
        },
        ...(opts.status === "incomplete" ? { remaining_work: true } : {}),
      });
  const outcome = toLegacyOutcome(terminal.kind);
  const completion: ActCompletion = {
    action_outcome: action,
    goal_status:
      terminal.kind === "GOAL_VERIFIED"
        ? "completed"
        : terminal.kind === "INCOMPLETE"
          ? "incomplete"
          : "unknown",
    reason: providerCompleted
      ? "PROVIDER_COMPLETED"
      : action === "FAILED"
        ? "VERIFIER_FAILED"
        : action === "UNKNOWN"
          ? "UNOBSERVED_ACTION"
          : (opts.reason ??
            (terminal.kind === "GOAL_VERIFIED"
              ? "GOAL_OBSERVED"
              : terminal.kind === "INCOMPLETE"
                ? "GOAL_UNMET"
                : "GOAL_UNCONFIRMED")),
    reassessments: opts.reassessments,
    ...(session.assessmentBudget
      ? {
          assessment: {
            version: 1 as const,
            calls: session.assessmentBudget.calls,
            reads: session.assessmentBudget.reads,
            confirmation:
              providerCompleted ||
              actions.some((a) => a.confirmation === "llm_evidence")
                ? ("llm_evidence" as const)
                : actions.some((a) => a.confirmation === "current_state")
                  ? ("current_state" as const)
                  : actions.some((a) => a.outcome === "VERIFIED")
                    ? ("local_verifier" as const)
                    : ("none" as const),
          },
        }
      : {}),
  };
  const label =
    completion.goal_status === "completed"
      ? "요청한 목표의 완료를 확인했습니다."
      : completion.goal_status === "incomplete"
        ? "동작은 완료했으며 목표에 남은 작업이 있습니다."
        : action === "VERIFIED"
          ? "동작은 완료했습니다. 최종 화면 확인이 필요합니다."
          : action === "FAILED"
            ? "동작 검증이 실패했습니다. 목표 완료로 처리하지 않습니다."
            : "동작 결과를 확정하지 못했습니다. 자동으로 다시 실행하지 않습니다.";
  const message = [
    label,
    completion.goal_status === "completed" ||
    completion.goal_status === "incomplete"
      ? safeChatText(opts.summary)
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const executionCode = (
    actions.find((a) => a.outcome === "FAILED" && a.code) ??
    actions.find((a) => a.outcome !== "VERIFIED" && a.code)
  )?.code;
  const code = providerCompleted
    ? undefined
    : isErrorCode(executionCode)
      ? executionCode
      : action !== "VERIFIED"
        ? "POSTCONDITION_UNVERIFIED"
        : completion.goal_status === "incomplete"
          ? "GOAL_INCOMPLETE"
          : completion.goal_status === "unknown"
            ? "GOAL_UNVERIFIED"
            : undefined;
  traceDecision("act.goal.feedback", {
    terminal: terminal.kind,
    action_count: actions.length,
    verified_actions: verified,
    observation_current: opts.current,
    model_status: opts.status,
    provider_completed: providerCompleted,
    ...completion,
  });
  void session.learnedProfile?.seal(
    completion.goal_status === "completed" &&
      (session.executionEvidence ?? []).length > 0 &&
      (action === "VERIFIED" ||
        (session.executionEvidence ?? []).every(
          (r) => r.page_method_invocation === "returned",
        )),
  );
  dependencies.coordinator.runs.terminal(run.id, outcome, code);
  dependencies.publish(run.id, { type: "assistant_delta", text: message });
  dependencies.publish(run.id, {
    type: "activity_finished",
    stage: !providerCompleted && action === "FAILED" ? "FAILED" : "COMPLETED",
  });
  dependencies.publish(run.id, {
    type: "run_terminal",
    outcome,
    ...(code ? { code } : {}),
    completion,
  });
  dependencies.endSession(session);
  return {
    ok: true,
    state: terminal.kind,
    terminal: terminal.kind,
    reason: terminal.reason,
    outcome,
    message,
    ...(code ? { code } : {}),
    completion,
  };
};
