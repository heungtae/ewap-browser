import { actModelJudgment } from "./act-model-judgment.js";
import { primaryAnswerReview } from "./primary-answer-review.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
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
  if (result?.verdict === "accept") return true;
  if (result?.verdict === "further_work") return false;
  // A separate bounded review assignment leaves a suspended proposal's real tool call untouched.
  return primaryAnswerReview(
    dependencies.provider,
    session.prompt,
    JSON.stringify(prepared),
    session.runId,
    dependencies.publish,
    context,
  );
};
