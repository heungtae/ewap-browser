import { actModelJudgment } from "./act-model-judgment.js";
import { primaryAnswerReview } from "./primary-answer-review.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import { traceDecision } from "../diagnostics/method-trace.js";
/** A prepared proposal remains unapproved regardless of either model's verdict. */
export const reviewPreparedTask = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  prepared: Record<string, unknown>,
): Promise<boolean> => {
  const context = session.requestContext;
  if (!context || !dependencies.provider.bindings || !session.runId)
    return true;
  const binding = await dependencies.provider.bindings.get(context.signal);
  if (!binding.decision || binding.failed) return true;
  const result = await actModelJudgment(
    dependencies,
    session,
    "result_acceptance",
    {
      phase_status: "proposed_unapproved",
      prepared_task: prepared,
    },
    {
      accept:
        "The supplied prepared task fits the original request and states its limits. It remains subject to existing approval, permission and preflight checks.",
      further_work:
        "Required work, exact inputs or relevant evidence is missing; do not present this as ready to execute.",
      unknown: "Further investigation, explanation or clarification is needed.",
    },
  );
  if (result?.verdict === "accept" || result?.verdict === "further_work") {
    traceDecision("act.prepared_task.review", {
      phase: "result_acceptance",
      reviewer_kind: result.judgment.source,
      decision_id: result.judgment.decision_id,
      verdict: result.verdict,
      outcome:
        result.verdict === "accept"
          ? "accepted_for_existing_gates"
          : "blocked_for_further_work",
    });
    return result.verdict === "accept";
  }
  // A separate bounded review assignment leaves a suspended proposal's real tool call untouched.
  let accepted: boolean;
  try {
    accepted = await primaryAnswerReview(
      dependencies.provider,
      session.prompt,
      JSON.stringify(prepared),
      session.runId,
      dependencies.publish,
      context,
    );
  } catch (error) {
    traceDecision("act.prepared_task.review", {
      phase: "result_acceptance",
      reviewer_kind: "primary_answer_review_fallback",
      outcome: "review_failed",
      code:
        error instanceof Error && error.message.startsWith("PROVIDER_")
          ? error.message.split(":", 1)[0]
          : "REVIEW_ERROR",
    });
    throw error;
  }
  traceDecision("act.prepared_task.review", {
    phase: "result_acceptance",
    reviewer_kind: "primary_answer_review_fallback",
    verdict: accepted ? "accept" : "further_work",
    outcome: accepted
      ? "accepted_for_existing_gates"
      : "blocked_for_further_work",
  });
  return accepted;
};
