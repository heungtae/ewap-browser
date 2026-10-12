import { advancePlanStep } from "./page-method-plan.js";
import type { ActSession, ActProposal } from "./act-session-types.js";
import type { ActExecutionEvidence } from "./act-execution-feedback.js";
import type { ActivePage } from "./page-context-runtime.js";

/** An observed state is separate from proof of execution; never repeat mutation. */
export const assessCurrentState = (
  session: ActSession,
  proposal: ActProposal,
  evidence: ActExecutionEvidence,
  baseline: ActivePage,
  active: ActivePage,
) => {
  if (
    proposal.tool !== "set_checked_by_ref" ||
    active.snapshot.truncated ||
    typeof proposal.argument?.checked !== "boolean"
  )
    return;
  const before = baseline.snapshot.nodes.find(
    (n) => n.ref_id === proposal.refId,
  );
  if (
    before &&
    baseline.snapshot.nodes.filter(
      (n) => n.role === before.role && n.name === before.name,
    ).length !== 1
  )
    return;
  const candidates = active.snapshot.nodes.filter(
    (n) =>
      before && n.role === before.role && n.name === before.name && n.visible,
  );
  if (
    candidates.length !== 1 ||
    candidates[0]!.state.checked !== proposal.argument.checked
  )
    return;
  evidence.outcome = "VERIFIED";
  evidence.verifier = "satisfied";
  evidence.observed = true;
  evidence.confirmation = "current_state";
  evidence.stateSatisfied = true;
  if (session.plan) advancePlanStep(session.plan, true);
  delete session.feedbackOnly;
};
