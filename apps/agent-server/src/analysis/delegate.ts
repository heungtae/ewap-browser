import { digest } from "../../../../packages/codebase-schema/src/digest.js";
import type { AnalysisEngine } from "../../../../packages/analysis-engine/src/engine.js";
import {
  requestSchema,
  type AnalysisRequest,
} from "../../../../packages/analysis-engine/src/contracts.js";
import { advanceTask } from "../../../../packages/task-engine/src/orchestration/advance-task.js";
import type {
  Orchestration,
  OrchestrationStore,
} from "../../../../packages/task-engine/src/orchestration/contracts.js";
export async function delegateAnalysis(
  state: Orchestration,
  raw: AnalysisRequest,
  engine: AnalysisEngine,
  store: OrchestrationStore,
  now: () => number,
  signal?: AbortSignal,
) {
  const request = requestSchema.parse(raw);
  if (
    state.phase !== "analysis" ||
    state.context.taskId !== request.taskId ||
    state.context.taskRevision !== request.taskRevision ||
    request.deadline > state.deadline
  )
    throw new Error("ANALYSIS_TASK_BINDING");
  const outcome = await engine.run(request, signal);
  if (signal?.aborted) throw new Error("ANALYSIS_CANCELLED");
  const failed = outcome.status === "UNAVAILABLE";
  const entry = {
    expectedRevision: state.context.taskRevision,
    next: failed
      ? ("suspended" as const)
      : outcome.status === "NEEDS_DATA"
        ? ("planning" as const)
        : ("result_acceptance" as const),
    role: failed ? ("runtime" as const) : ("analyst" as const),
    evidenceRefs: failed ? [] : [outcome.inputDigest],
    progressDigest: await digest(outcome),
    ...(failed ? { reason: outcome.code } : {}),
  };
  const next = await advanceTask(state, entry, store, now());
  // Data needs are proposals for the controller; they never call a collector or grant consent.
  // Supported content still requires JEV/runtime acceptance before final UI publication.
  return {
    state: next,
    status: failed
      ? ("UNAVAILABLE" as const)
      : outcome.status === "NEEDS_DATA"
        ? ("CONTROLLER_DATA_REQUEST" as const)
        : ("PENDING_CONTROLLER_ACCEPTANCE" as const),
    outcome,
  };
}
