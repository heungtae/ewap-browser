import type { ActCompletion } from "../contracts/act-completion.js";
import { withDeadline } from "../security/deadline.js";
import { digestCanonical } from "../security/canonical.js";
import type { SemanticSnapshot, SemanticNode } from "../contracts/types.js";
import type { PageScope } from "../state/tab-chat-session-store.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { ActSession } from "./act-session-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import { assertRequestActive } from "./request-context.js";

// Reading identity is independent of opaque action references. This fingerprint
// never grants dispatch authority or reconnects a changed document/scope.
const semanticNode = (node: SemanticNode) => {
  const {
    ref_id: _ref,
    parent_ref_id: _parent,
    label_ref_id: _label,
    ...rest
  } = node;
  return rest;
};
export const goalObservationDigest = (snapshot: SemanticSnapshot): string => {
  const indexes = new Map(
    snapshot.nodes.map((node, index) => [node.ref_id, index]),
  );
  return digestCanonical({
    ...snapshot,
    nodes: snapshot.nodes.map((node) => ({
      ...semanticNode(node),
      parent: node.parent_ref_id ? (indexes.get(node.parent_ref_id) ?? -1) : -1,
      label: node.label_ref_id ? (indexes.get(node.label_ref_id) ?? -1) : -1,
    })),
  });
};

export const goalBindingCurrent = (
  dependencies: ActStepDependencies,
  session: ActSession,
  active: ActivePage,
  scope: PageScope,
): boolean => {
  const current = dependencies.pageScope(active);
  return (
    active.tabId === session.tabId &&
    active.origin === session.origin &&
    active.snapshot.document_epoch === scope.document_epoch &&
    current.document_epoch === scope.document_epoch &&
    current.page_scope_epoch === scope.page_scope_epoch &&
    active.snapshot.frame_id === 0 &&
    current.origin === scope.origin &&
    current.path === scope.path
  );
};

// Evidence refs identify read-only regions from the model's supplied projection.
// A unique replacement may be read, but never inherits the old action authority.
export const goalEvidenceCurrent = (
  before: SemanticSnapshot,
  after: SemanticSnapshot,
  indexes: number[],
): boolean => {
  if (!indexes.length || before.truncated || after.truncated) return false;
  return indexes.every((index) => {
    const node = before.nodes[index];
    if (!node?.visible || !["dialog", "main", "form"].includes(node.role))
      return false;
    const candidates = after.nodes.filter(
      (n) => n.role === node.role && n.name === node.name && n.visible,
    );
    if (candidates.length !== 1) return false;
    return (
      !!node.completion_digest &&
      node.completion_digest === candidates[0]!.completion_digest &&
      digestCanonical(semanticNode(node)) ===
        digestCanonical(semanticNode(candidates[0]!))
    );
  });
};

export const observeStableGoal = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  initial: ActivePage,
  scope: PageScope,
  deadline: number,
): Promise<{ active?: ActivePage; reason?: ActCompletion["reason"] }> => {
  let previous = initial,
    digest = goalObservationDigest(initial.snapshot);
  for (let samples = 0; samples < 3 && Date.now() < deadline; samples++) {
    assertRequestActive(session.requestContext);
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    assertRequestActive(session.requestContext);
    const latest = await withDeadline(
      dependencies.readActive(undefined, session.tabId),
      Math.max(0, deadline - Date.now()),
      "REQUEST_TIMEOUT",
    ).catch(() => undefined);
    assertRequestActive(session.requestContext);
    if (!latest)
      return {
        reason:
          Date.now() >= deadline
            ? "REASSESSMENT_LIMIT"
            : "OBSERVATION_UNAVAILABLE",
      };
    if (!goalBindingCurrent(dependencies, session, latest, scope))
      return { reason: "BINDING_CHANGED" };
    const next = goalObservationDigest(latest.snapshot);
    if (next === digest && !latest.snapshot.truncated)
      return { active: latest };
    previous = latest;
    digest = next;
  }
  return Date.now() >= deadline
    ? { reason: "REASSESSMENT_LIMIT" }
    : { active: previous };
};
