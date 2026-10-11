import { ContractError } from "../security/validation.js";
import { assertRequestActive } from "./request-context.js";
import type { ActSession } from "./act-session-types.js";

export type AssessmentPhase = "element" | "action" | "goal";
export type AssessmentBudget = {
  deadline: number;
  calls: number;
  reads: number;
  phases: Record<string, number>;
};
export const assessmentLimits = Object.freeze({
  calls: 4,
  phaseCalls: 2,
  reads: 2,
  durationMs: 30_000,
  providerMs: 15_000,
});
export const assessmentBudget = (session: ActSession): AssessmentBudget =>
  (session.assessmentBudget ??= {
    deadline: Date.now() + assessmentLimits.durationMs,
    calls: 0,
    reads: 0,
    phases: {},
  });
export const consumeAssessment = (
  session: ActSession,
  phase: AssessmentPhase,
  step = "goal",
  read = false,
): number => {
  assertRequestActive(session.requestContext);
  const budget = assessmentBudget(session);
  const key = `${step}:${phase}`;
  if (
    Date.now() >= budget.deadline ||
    (read
      ? budget.reads >= assessmentLimits.reads
      : budget.calls >= assessmentLimits.calls ||
        (budget.phases[key] ?? 0) >= assessmentLimits.phaseCalls)
  )
    throw new ContractError("REQUEST_TIMEOUT");
  if (read) budget.reads++;
  else {
    budget.calls++;
    budget.phases[key] = (budget.phases[key] ?? 0) + 1;
  }
  return Math.min(budget.deadline, Date.now() + assessmentLimits.providerMs);
};
