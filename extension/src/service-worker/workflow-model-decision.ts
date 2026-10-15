import { actModelJudgment } from "./act-model-judgment.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type { SuitabilityVerdict } from "./act-harness-turns.js";
export const workflowModelDecision = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  projection: string,
  originalReady: () => Promise<boolean>,
): Promise<SuitabilityVerdict | undefined> => {
  if (!session.workflow || !(await originalReady())) return undefined;
  const result = await actModelJudgment(
    dependencies,
    session,
    "workflow_suitability",
    {
      candidate_id: session.harnessReview?.candidate_id,
      original_workflow: session.workflow.declaration,
      original_read: true,
      projection,
    },
    {
      match:
        "The complete supplied original workflow fits the original request as-is on the current page.",
      partial:
        "The workflow needs changes; primary must explain the difference.",
      mismatch: "The original workflow does not fit the request.",
      needs_context: "Evidence is insufficient; primary should investigate.",
    },
  );
  if (!result || !["match", "mismatch"].includes(result.verdict))
    return undefined;
  return {
    verdict: result.verdict as "match" | "mismatch",
    rationale:
      result.verdict === "match"
        ? "현재 페이지와 원본 워크플로우가 요청에 부합합니다."
        : "원본 워크플로우가 현재 요청과 부합하지 않습니다.",
    missing: [],
  };
};
