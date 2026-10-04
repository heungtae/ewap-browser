import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import { isOpaqueId } from "./contracts.js";

export type PlanStepInput = {
  intent: string;
  target_evidence_id?: string;
  user_input?: string;
  side_effects?: string[];
  capability: string;
  postcondition: string;
};

export type SubmitPlanInput = {
  plan_id: string;
  request_revision: number;
  goal: string;
  evidence_ids: string[];
  coverage_note: string;
  provenance: string;
  origin_diff?: string;
  steps: PlanStepInput[];
  approval_scope: string;
};

export const validateSubmitPlan = (
  plan: SubmitPlanInput,
  allowedCapabilities: string[],
  expectedRevision: number,
): SubmitPlanInput =>
  traceMethod(
    "page-act-harness/plan-contract.ts:validateSubmitPlan",
    { plan_id: plan.plan_id, step_count: plan.steps.length },
    (context) => {
      const method = "page-act-harness/plan-contract.ts:validateSubmitPlan";
      const reject = (code: string, condition: string): never => {
        traceBranch(context, method, "fail", code, condition);
        throw new Error(code);
      };
      if (!isOpaqueId(plan.plan_id))
        reject("PLAN_ID_INVALID", "plan id must be opaque");
      if (plan.request_revision !== expectedRevision)
        reject(
          "STALE_REQUEST_REVISION",
          "plan bound to a stale request revision",
        );
      if (!plan.goal || plan.goal.trim().length === 0)
        reject("GOAL_REQUIRED", "original goal required");
      if (!plan.coverage_note || plan.coverage_note.trim().length === 0)
        reject("COVERAGE_REQUIRED", "evidence coverage note required");
      if (!plan.provenance || plan.provenance.trim().length === 0)
        reject("PROVENANCE_REQUIRED", "plan provenance required");
      if (!plan.approval_scope || plan.approval_scope.trim().length === 0)
        reject("APPROVAL_SCOPE_REQUIRED", "approval scope required");
      if (plan.evidence_ids.length === 0)
        reject("EVIDENCE_REQUIRED", "plan without evidence is not reviewable");
      for (const id of plan.evidence_ids)
        if (!isOpaqueId(id))
          reject("EVIDENCE_ID_INVALID", "evidence ids must be opaque");
      if (plan.steps.length === 0)
        reject("STEPS_REQUIRED", "at least one step required");
      for (const step of plan.steps) {
        if (!step.intent || step.intent.trim().length === 0)
          reject("STEP_INTENT_REQUIRED", "each step needs an intent");
        if (!step.postcondition || step.postcondition.trim().length === 0)
          reject("POSTCONDITION_REQUIRED", "each step needs a postcondition");
        if (
          step.target_evidence_id &&
          (!isOpaqueId(step.target_evidence_id) ||
            !plan.evidence_ids.includes(step.target_evidence_id))
        )
          reject(
            "TARGET_EVIDENCE_DANGLING",
            "step target must reference plan evidence_ids",
          );
        if (!allowedCapabilities.includes(step.capability))
          reject(
            `UNSUPPORTED_STEP:${step.capability}`,
            "unsupported steps are rejected, never silently dropped",
          );
      }
      traceDecision("page-act-harness.plan.validated", {
        plan_id: plan.plan_id,
        request_revision: plan.request_revision,
        evidence_ids: plan.evidence_ids,
        coverage_note: plan.coverage_note,
        provenance: plan.provenance,
        origin_diff: plan.origin_diff ?? null,
        step_count: plan.steps.length,
        approval_scope: plan.approval_scope,
      });
      return plan;
    },
  );

// PAH-3 partial helper: missing-evidence gate only. Full match/partial/
// mismatch suitability review (design §8.1) lands in PAH-5.
export const needsContextFor = (
  requiredEvidence: string[],
  availableEvidence: string[],
): { verdict: "needs_context"; missing: string[] } | { verdict: "ready" } => {
  const missing = requiredEvidence.filter(
    (id) => !availableEvidence.includes(id),
  );
  return missing.length > 0
    ? { verdict: "needs_context", missing }
    : { verdict: "ready" };
};
