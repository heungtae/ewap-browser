import type { CompletionContract } from "../contracts/action-types.js";
import type { PageScope } from "../state/tab-chat-session-store.js";
import type { ActSession, ActProposal } from "./act-session-types.js";
import type { ActivePage } from "./page-context-runtime.js";
import { digestCanonical } from "../security/canonical.js";

export type LocalGoalProof = {
  completion: CompletionContract;
  scope: PageScope;
};
export const recordLocalGoal = (
  session: ActSession,
  proposal: ActProposal,
  evidence: { outcome: "VERIFIED" | "FAILED" | "UNKNOWN" },
  verifiedScope?: PageScope,
): void => {
  delete session.localGoalProof;
  if (proposal.tool === "call_page_api" || evidence.outcome !== "VERIFIED")
    return;
  const completion = proposal.definition?.completion;
  // Only a trusted full-request declaration can bypass model goal reasoning.
  if (
    completion?.source !== "trusted_profile" ||
    completion.kind === "render_result" ||
    completion.goal_request_digest !== digestCanonical(session.prompt) ||
    !session.lastObservationScope
  )
    return;
  if (completion.kind === "navigation" && !verifiedScope) return;
  session.localGoalProof = {
    completion: structuredClone(completion),
    scope: structuredClone(verifiedScope ?? session.lastObservationScope),
  };
};
export const localGoalCurrent = (
  session: ActSession,
  active: ActivePage,
  scope: PageScope,
): boolean => {
  const proof = session.localGoalProof;
  if (
    !proof ||
    active.snapshot.truncated ||
    active.tabId !== session.tabId ||
    active.origin !== session.origin ||
    proof.completion.goal_request_digest !== digestCanonical(session.prompt) ||
    (session.plan &&
      session.plan.completedSteps < session.plan.input.steps.length) ||
    session.executionEvidence?.some((a) => a.outcome !== "VERIFIED")
  )
    return false;
  const completion = proof.completion;
  if (completion.kind === "navigation") {
    // Navigation was already verified against its actual URL and registered
    // scope; a trusted destination marker must still be present in this read.
    if (
      !completion.destination_marker ||
      digestCanonical(scope) !== digestCanonical(proof.scope)
    )
      return false;
  } else if (
    scope.document_epoch !== proof.scope.document_epoch ||
    scope.page_scope_epoch !== proof.scope.page_scope_epoch ||
    scope.origin !== proof.scope.origin ||
    scope.path !== proof.scope.path
  )
    return false;
  if (completion.kind === "control_state")
    return completion.expected_changes.every((expected) => {
      const nodes = active.snapshot.nodes.filter(
        (node) => node.ref_id === expected.ref_id && node.visible,
      );
      return (
        nodes.length === 1 &&
        nodes[0]!.state[expected.field] === expected.expected
      );
    });
  const marker =
    completion.kind === "navigation"
      ? completion.destination_marker
      : completion.kind === "ui_relation"
        ? completion.marker
        : undefined;
  if (!marker) return false;
  return (
    active.snapshot.nodes.filter(
      (node) =>
        node.visible &&
        node.role === marker.role &&
        node.name === marker.name &&
        (!marker.state ||
          node.state[marker.state.field] === marker.state.expected),
    ).length === 1
  );
};
