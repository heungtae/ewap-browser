import { opaqueId } from "../security/canonical.js";
import { isPlainObject, fail } from "../security/validation.js";
import {
  validateSubmitPlan,
  type SubmitPlanInput,
} from "../page-act-harness/plan-contract.js";
import {
  grantApproval,
  consumeApproval,
} from "../page-act-harness/approval-store.js";
import type { ActSession, ActProposal } from "./act-session-types.js";
import type { ProviderToolCall } from "../providers/types.js";
import { assertRequestActive } from "./request-context.js";

export type StoredActPlan = {
  input: SubmitPlanInput;
  revision: number;
  documentEpoch: string;
  toolCallId: string;
  reviewId: string;
  approved: boolean;
  completedSteps: number;
};
const boundedText = (value: unknown, max = 2000): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const keys = (obj: Record<string, unknown>, allowed: string[]) =>
  Object.keys(obj).every((key) => allowed.includes(key));

export const storeSubmittedPlan = (opts: {
  session: ActSession;
  call: ProviderToolCall;
  revision: number;
  documentEpoch: string;
  capabilities: string[];
  evidenceIds: string[];
}): StoredActPlan => {
  assertRequestActive(opts.session.requestContext);
  if (opts.call.arguments.length > 32768) return fail("INVALID_ARGUMENT");
  const value: unknown = JSON.parse(opts.call.arguments);
  if (
    !isPlainObject(value) ||
    !keys(value, [
      "request_revision",
      "goal",
      "evidence_ids",
      "coverage_note",
      "provenance",
      "origin_diff",
      "steps",
      "approval_scope",
    ]) ||
    !Number.isSafeInteger(value.request_revision) ||
    !boundedText(value.goal) ||
    !boundedText(value.coverage_note) ||
    !boundedText(value.provenance) ||
    (value.origin_diff !== undefined && !boundedText(value.origin_diff)) ||
    value.approval_scope !== "single_step" ||
    !Array.isArray(value.evidence_ids) ||
    value.evidence_ids.length > 32 ||
    !value.evidence_ids.every(
      (id) => typeof id === "string" && opts.evidenceIds.includes(id),
    ) ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    value.steps.length > 12
  )
    return fail("INVALID_ARGUMENT");
  for (const step of value.steps) {
    if (
      !isPlainObject(step) ||
      !keys(step, [
        "intent",
        "capability",
        "target_evidence_id",
        "user_input",
        "side_effects",
        "postcondition",
      ]) ||
      !boundedText(step.intent) ||
      !boundedText(step.capability) ||
      !boundedText(step.postcondition) ||
      (step.user_input !== undefined && !boundedText(step.user_input, 4096)) ||
      (step.target_evidence_id !== undefined &&
        typeof step.target_evidence_id !== "string") ||
      (step.side_effects !== undefined &&
        (!Array.isArray(step.side_effects) ||
          step.side_effects.length > 8 ||
          !step.side_effects.every((item) => boundedText(item))))
    )
      return fail("INVALID_ARGUMENT");
  }
  const input = validateSubmitPlan(
    { ...value, plan_id: opaqueId() } as SubmitPlanInput,
    opts.capabilities,
    opts.revision,
  );
  const plan: StoredActPlan = {
    input,
    revision: (opts.session.plan?.revision ?? 0) + 1,
    documentEpoch: opts.documentEpoch,
    toolCallId: opts.call.id,
    reviewId: opaqueId(),
    approved: false,
    completedSteps: 0,
  };
  opts.session.plan = plan;
  delete opts.session.proposal;
  delete opts.session.continueAfterApproval;
  return plan;
};

export const approveSubmittedPlan = (
  session: ActSession,
  documentEpoch: string,
  revision: number,
): void => {
  assertRequestActive(session.requestContext);
  const plan = session.plan;
  if (
    !plan ||
    plan.approved ||
    plan.documentEpoch !== documentEpoch ||
    plan.input.request_revision !== revision
  )
    return fail("CONFIRMATION_INVALID");
  const approval = grantApproval({
    approval_id: plan.reviewId,
    plan_id: plan.input.plan_id,
    plan_revision: plan.revision,
    request_revision: revision,
    scope: "single_step",
  });
  consumeApproval(approval, {
    plan_id: plan.input.plan_id,
    plan_revision: plan.revision,
    request_revision: revision,
    binding_current: true,
  });
  plan.approved = true;
  session.messages.push({
    role: "tool",
    tool_call_id: plan.toolCallId,
    content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({ status: "PLAN_APPROVED", plan_id: plan.input.plan_id, plan_revision: plan.revision, request_revision: revision, execution_authorized: false })}\n[/UNTRUSTED_TOOL_RESULT]`,
  });
};

export const assertApprovedPlan = (
  session: ActSession,
  proposal: ActProposal,
  epoch: string,
  revision: number,
): void => {
  const plan = session.plan;
  if (!plan) return;
  const step = plan.input.steps[plan.completedSteps];
  const names: Record<string, string> = {
    click_by_ref: "propose_click",
    navigate: "propose_navigate",
    set_text_by_ref: "propose_set_text",
    select_option_by_ref: "propose_select_option",
    set_checked_by_ref: "propose_set_checked",
    press_key_by_ref: "propose_press_key",
    call_page_api: "propose_page_api",
  };
  if (
    !plan.approved ||
    proposal.approvalScope !== "single_step" ||
    plan.documentEpoch !== epoch ||
    plan.input.request_revision !== revision ||
    !step ||
    step.capability !== names[proposal.tool] ||
    (step.user_input !== undefined &&
      step.user_input !==
        (proposal.tool === "call_page_api"
          ? proposal.optionId
          : proposal.value))
  )
    return fail("CONFIRMATION_INVALID");
};
