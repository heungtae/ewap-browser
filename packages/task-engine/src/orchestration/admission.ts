import { contextSchema, type DecisionContext } from "../decisions/schema.js";
import type { Orchestration } from "./contracts.js";
export function admitOrchestration(
  raw: DecisionContext,
  readiness: { enabled: boolean; configured: boolean; qualified: boolean },
  deadline: number,
  now: number,
): Orchestration {
  const context = contextSchema.parse(raw);
  if (!readiness.enabled || !readiness.configured || !readiness.qualified)
    throw new Error("CONTROLLER_UNAVAILABLE");
  if (!Number.isSafeInteger(deadline) || deadline <= now)
    throw new Error("TASK_EXPIRED");
  return {
    context,
    phase: "admission",
    resumePhase: null,
    outcome: "PENDING",
    firstFailure: null,
    activeStep: null,
    verifiedSteps: [],
    ambiguousSteps: [],
    turns: 0,
    noProgress: 0,
    progressDigest: null,
    deadline,
  };
}
