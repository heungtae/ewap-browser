import { digestCanonical, opaqueId } from "../security/canonical.js";
import type { SemanticNode } from "../contracts/types.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { ActSession } from "./act-session-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { Run } from "../state/run-coordinator.js";
import { goalBindingCurrent } from "./act-goal-observation.js";

const facts = (node: SemanticNode) => ({
  role: node.role,
  name: node.name,
  state: node.state,
  visible: node.visible,
  enabled: node.enabled,
  ...(node.completion_digest
    ? { completion_digest: node.completion_digest }
    : {}),
});
const matching = (
  page: ActivePage,
  node: SemanticNode,
  baseline?: ActivePage,
) => {
  const exact = page.snapshot.nodes.find((n) => n.ref_id === node.ref_id);
  if (exact) return exact;
  if (
    baseline &&
    baseline.snapshot.nodes.filter(
      (n) => n.role === node.role && n.name === node.name,
    ).length !== 1
  )
    return undefined;
  const replacements = page.snapshot.nodes.filter(
    (n) => n.role === node.role && n.name === node.name,
  );
  return replacements.length === 1 ? replacements[0] : undefined;
};
export const actionObservation = (
  dependencies: ActStepDependencies,
  session: ActSession,
  run: Run,
  active: ActivePage,
) => {
  const proposal = session.pendingAssessment!;
  const baseline = session.assessmentBaseline;
  const target =
    baseline && "refId" in proposal
      ? baseline.snapshot.nodes.find((node) => node.ref_id === proposal.refId)
      : undefined;
  const current = target ? matching(active, target, baseline) : undefined;
  const conflicting =
    proposal.tool === "set_checked_by_ref" &&
    typeof current?.state.checked === "boolean" &&
    current.state.checked !== proposal.argument?.checked;
  const nodes = current ? [current] : [];
  const parent =
    target?.parent_ref_id &&
    baseline?.snapshot.nodes.find((n) => n.ref_id === target.parent_ref_id);
  if (parent) {
    const region = matching(active, parent, baseline);
    if (region && ["main", "form", "dialog"].includes(region.role))
      nodes.push(region);
  }
  const evidence = nodes
    .filter((node) => node.visible)
    .map((node) => {
      const before = baseline ? matching(baseline, node, active) : undefined;
      return {
        id: opaqueId(),
        before: before ? facts(before) : null,
        after: facts(node),
        changed:
          !!before &&
          digestCanonical(facts(before)) !== digestCanonical(facts(node)),
      };
    });
  const scope = structuredClone(dependencies.pageScope(active));
  const packet = {
    observation_id: opaqueId(),
    attempt_id: proposal.id,
    phase: "action",
    reason: "LOCAL_UI_RESULT_UNCLEAR",
    observed_at: Date.now(),
    coverage:
      active.snapshot.truncated || baseline?.snapshot.truncated
        ? "truncated"
        : "bounded",
    action: {
      tool: proposal.tool,
      target_name: proposal.targetName,
      ...("argument" in proposal
        ? { expected_argument: proposal.argument }
        : {}),
    },
    execution: session.executionEvidence?.at(-1),
    evidence,
    projection: dependencies.coordinator.modelSnapshot(run.id, active.snapshot)
      .snapshot,
  };
  return {
    packet,
    allEvidenceIds: evidence.map((item) => item.id),
    evidenceIds:
      active.snapshot.truncated || baseline?.snapshot.truncated || conflicting
        ? []
        : evidence.filter((e) => e.changed).map((e) => e.id),
    current(latest: ActivePage, ids: string[]) {
      return (
        !conflicting &&
        !latest.snapshot.truncated &&
        goalBindingCurrent(dependencies, session, latest, scope) &&
        ids.length > 0 &&
        ids.every((id) => {
          const index = evidence.findIndex((e) => e.id === id);
          const node = nodes.filter((n) => n.visible)[index];
          const fresh = node && matching(latest, node, active);
          return (
            !!fresh &&
            digestCanonical(facts(fresh)) ===
              digestCanonical(evidence[index]!.after)
          );
        })
      );
    },
  };
};
