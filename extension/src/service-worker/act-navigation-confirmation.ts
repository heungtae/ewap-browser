import { advancePlanStep } from "./page-method-plan.js";
import type { CompletionContract } from "../contracts/action-types.js";
import type { ActSession } from "./act-session-types.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { PageScope } from "../state/tab-chat-session-store.js";
import { traceDecision } from "../diagnostics/method-trace.js";

export type NavigationBinding = {
  destination_digest: string;
  source_document_epoch: string;
  source_page_scope_epoch: string;
  destination_marker?: Extract<
    CompletionContract,
    { kind: "navigation" }
  >["destination_marker"];
};

// A goal report may confirm only the dispatched, reference-bound navigation.
// Matching an origin or a current observation alone grants no such proof.
export const confirmNavigation = (
  session: ActSession,
  active: ActivePage,
  scope: PageScope,
  report: { status: string; indexes: number[] },
  current: boolean,
): boolean => {
  const evidence = session.executionEvidence?.at(-1);
  const binding = evidence?.navigation_binding;
  if (
    !current ||
    report.status !== "completed" ||
    !report.indexes.length ||
    !evidence?.navigation ||
    evidence.outcome !== "UNKNOWN" ||
    evidence.raw_outcome !== "UNKNOWN" ||
    evidence.dispatch !== "dispatched" ||
    !evidence.dispatched ||
    evidence.code !== "NAVIGATION_UNVERIFIED" ||
    !binding ||
    active.tabId !== session.tabId ||
    active.snapshot.frame_id !== 0 ||
    active.snapshot.truncated ||
    active.navigationUrlDigest !== binding.destination_digest ||
    active.snapshot.document_epoch !== scope.document_epoch ||
    (scope.document_epoch === binding.source_document_epoch &&
      scope.page_scope_epoch === binding.source_page_scope_epoch) ||
    report.indexes.some((index) => !active.snapshot.nodes[index]?.visible)
  ) {
    traceDecision("act.navigation.confirmation", {
      accepted: false,
      code:
        binding && active.navigationUrlDigest !== binding.destination_digest
          ? "DESTINATION_MISMATCH"
          : "EVIDENCE_OR_BINDING_UNVERIFIED",
      current_url: active.url,
      destination_matches:
        !!binding && active.navigationUrlDigest === binding.destination_digest,
      observation_current: current,
      evidence_count: report.indexes.length,
    });
    return false;
  }
  if (binding.destination_marker) {
    const marker = binding.destination_marker;
    const matches = active.snapshot.nodes.filter(
      (node) =>
        node.visible &&
        node.role === marker.role &&
        node.name === marker.name &&
        (!marker.state ||
          node.state[marker.state.field] === marker.state.expected),
    );
    if (matches.length !== 1) return false;
  }
  Object.assign(evidence, {
    outcome: "VERIFIED",
    observed: true,
    verifier: "satisfied",
    confirmation: "llm_evidence",
  });
  if (session.plan) advancePlanStep(session.plan, true);
  session.navigationFeedback = true;
  traceDecision("act.navigation.confirmation", {
    attempt_id: evidence.action_id,
    raw_outcome: evidence.raw_outcome,
    confirmation: evidence.confirmation,
    destination_bound: true,
    accepted: true,
    current_url: active.url,
  });
  return true;
};
