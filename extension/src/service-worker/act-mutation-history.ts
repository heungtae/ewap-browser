import { digestCanonical } from "../security/canonical.js";
import type { ActSession, ActProposal } from "./act-session-types.js";
import type { ActivePage } from "./page-context-runtime.js";

export const mutationBinding = (
  session: ActSession,
  proposal: ActProposal,
  page?: ActivePage,
): {
  target_binding?: string;
  semantic_binding?: string;
  input_binding?: string;
} => {
  if (!("refId" in proposal)) return {};
  const target = page?.snapshot.nodes.find(
    (node) => node.ref_id === proposal.refId,
  );
  const unique =
    target &&
    page?.snapshot.nodes.filter(
      (n) => n.role === target.role && n.name === target.name,
    ).length === 1;
  const scope = session.assessmentBaselineScope ?? session.lastObservationScope;
  return {
    target_binding: digestCanonical({ scope, ref: proposal.refId }),
    ...(unique
      ? {
          semantic_binding: digestCanonical({
            scope,
            role: target.role,
            name: target.name,
          }),
        }
      : {}),
    input_binding: digestCanonical({
      tool: proposal.tool,
      value: proposal.value ?? null,
      argument: proposal.argument ?? null,
    }),
  };
};
/** No mutation retry after uncertain dispatch; verified identical intents use goal feedback. */
export const repeatedMutation = (
  session: ActSession,
  proposal: ActProposal,
  page: ActivePage,
): boolean => {
  const binding = mutationBinding(session, proposal, page);
  return (
    !!binding.target_binding &&
    (session.executionEvidence ?? []).some((attempt) => {
      if (attempt.dispatch === "not_dispatched" && attempt.outcome === "FAILED")
        return false;
      const sameTarget =
        attempt.target_binding === binding.target_binding ||
        (!!binding.semantic_binding &&
          attempt.semantic_binding === binding.semantic_binding);
      return (
        sameTarget &&
        (attempt.outcome !== "VERIFIED" ||
          attempt.input_binding === binding.input_binding)
      );
    })
  );
};
