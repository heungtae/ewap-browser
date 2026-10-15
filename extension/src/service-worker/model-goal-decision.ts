import { actModelJudgment } from "./act-model-judgment.js";
import { consumeAssessment } from "./act-assessment-budget.js";
import { validateGoalReportValue } from "./act-goal-report.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { Run } from "../state/run-coordinator.js";
const attempted = new WeakMap<ActSession, Set<string>>();
export const modelGoalDecision = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  run: Run,
  observation: ActivePage,
  observationId: string,
  refs: string[],
  deadline: number,
) => {
  if (
    !session.requestContext ||
    !dependencies.provider.bindings ||
    observation.snapshot.truncated
  )
    return undefined;
  const binding = await dependencies.provider.bindings.get(
    session.requestContext.signal,
  );
  if (!binding.decision || binding.failed) return undefined;
  const seen = attempted.get(session) ?? new Set<string>();
  if (seen.has(observationId)) return undefined;
  seen.add(observationId);
  attempted.set(session, seen);
  const model = dependencies.coordinator.modelSnapshot(
    run.id,
    observation.snapshot,
  ).snapshot;
  const eligible = model.nodes
    .filter((n) => n.visible && n.completion_digest)
    .map((n) => n.model_ref);
  const result = await actModelJudgment(
    dependencies,
    session,
    "goal_assessment",
    {
      observation_id: observationId,
      projection: model,
      coverage: "complete_current_projection_not_server_persistence",
      execution: session.executionEvidence?.map((e) => ({
        action_id: e.action_id,
        outcome: e.outcome,
        dispatch: e.dispatch,
        observed: e.observed,
        page_method_invocation: e.page_method_invocation,
      })),
    },
    {
      completed:
        "Current supplied evidence establishes the original requested goal.",
      incomplete: "Current evidence establishes remaining requested work.",
      unknown:
        "Current evidence establishes neither completion nor remaining work.",
    },
    Math.min(deadline, consumeAssessment(session, "goal")),
  );
  if (
    !result ||
    !["completed", "incomplete", "unknown"].includes(result.verdict)
  )
    return undefined;
  return validateGoalReportValue(
    {
      status: result.verdict,
      summary: "현재 자료에 결속된 목표 판단입니다.",
      observation_id: observationId,
      evidence_refs: eligible.slice(0, 8),
    },
    observationId,
    refs,
    eligible,
  );
};
