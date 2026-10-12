import type { PlanStepInput } from "../page-act-harness/plan-contract.js";
import type { ActSession, ActProposal } from "./act-session-types.js";
import type { StoredActPlan } from "./act-plan-types.js";
import { boundedJson, sensitiveJson } from "./act-proposal-parser.js";
import { digestCanonical } from "../security/canonical.js";
import { fail } from "../security/validation.js";

export const validateMethodPlanStep = (
  step: PlanStepInput,
  session: ActSession,
): void => {
  if (step.capability !== "propose_page_method_call") {
    if (step.method_ref !== undefined || step.arguments !== undefined)
      fail("INVALID_ARGUMENT");
    return;
  }
  const method = session.pageMethods?.find(
    (entry) => entry.method_ref === step.method_ref,
  );
  if (
    typeof step.method_ref !== "string" ||
    !session.pageMethods?.some(
      (method) => method.method_ref === step.method_ref,
    ) ||
    !Array.isArray(step.arguments) ||
    step.arguments.length > 32 ||
    step.arguments.length < (method?.arity ?? 0) ||
    !boundedJson(step.arguments) ||
    sensitiveJson(step.arguments) ||
    JSON.stringify(step.arguments).length > 4096 ||
    step.user_input !== undefined
  )
    fail("INVALID_ARGUMENT");
};
export const assertMethodPlanBinding = (
  step: PlanStepInput,
  proposal: ActProposal,
  plan: StoredActPlan,
): void => {
  if (proposal.tool !== "call_page_method") return;
  if (
    step.method_ref !== proposal.method.method_ref ||
    digestCanonical(step.arguments) !== proposal.argumentsDigest ||
    proposal.planId !== plan.input.plan_id ||
    proposal.planRevision !== plan.revision
  )
    fail("CONFIRMATION_INVALID");
};
export const advancePlanStep = (
  plan: StoredActPlan,
  verified: boolean,
): void => {
  plan.nextStep = (plan.nextStep ?? plan.completedSteps) + 1;
  if (verified) plan.completedSteps++;
};
