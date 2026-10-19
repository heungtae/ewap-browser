import {
  createFrame,
  enumerateCandidates,
  DecisionBudget,
  digest,
  type Candidate,
  type DecisionContext,
  type DecisionFrame,
  type DecisionResult,
  type Phase,
  type BindingContext,
} from "../../../../../packages/task-engine/src/decisions/index.js";
export const context: DecisionContext = {
  taskId: "task-1",
  taskRevision: 1,
  planRevision: 1,
  graphRevision: 1,
  evidenceRevision: 1,
  capabilityRevision: 1,
  cancellationGeneration: 0,
  mode: "act",
  scopeId: "scope-1",
};
export function candidate(id = "search"): Candidate {
  return {
    id,
    semanticId: id,
    description: "Fill the equipment field and submit the search",
    source: "registered",
    scopeId: context.scopeId,
    modes: ["act"],
    capabilityRefs: ["search-capability"],
    evidenceRefs: ["search-form-evidence"],
    unresolvedInputs: [],
    bindingDigests: {
      equipment: digest({ context, binding: literal, value: "EQP001" }),
    },
    steps: [
      {
        id: `${id}.fill`,
        tool: "web.fill",
        actionRef: "equipment-field",
        dependencies: [],
        parameters: ["equipment"],
        effect: "local-ui",
        preconditionRefs: ["visible-enabled-current"],
        goalPredicateRefs: ["filtered-equipment"],
      },
    ],
  };
}
export const eligibility = (c = candidate()) => ({
  candidate: c,
  policyPermitted: true,
  uniqueTarget: true,
  fresh: true,
  userMentionMatch: 0,
  workflowMatch: false,
  evidenceTime: 1,
  resolvedParameters: ["equipment"],
});
export const frame = (
  budget = new DecisionBudget(),
  phase: Phase = "next_tool",
  candidates = [candidate()],
): DecisionFrame =>
  createFrame({
    protocol: "wca.task/v1",
    templateVersion: "controller-v1",
    model: "jev-1.13.0",
    modelRevision: 1,
    context,
    phase,
    candidateSet: enumerateCandidates(
      context,
      candidates.map((c) => eligibility(c)),
      new Set(["search-capability"]),
    ),
    budgets: budget.snapshot(),
    facts: [{ id: "request", value: "Search EQP001" }],
    stateComplete: true,
  });
export function response(
  f: DecisionFrame,
  selected = f.candidateSet.candidates[0]?.id ?? "UNKNOWN",
): DecisionResult {
  const options = [
    ...f.candidateSet.candidates.map((c) => c.id),
    "INSPECT_MORE",
    "NEED_INPUT",
    "UNSUPPORTED",
    "UNKNOWN",
  ];
  return {
    protocol: f.protocol,
    frameDigest: f.digest,
    candidateDigest: f.candidateSet.digest,
    templateVersion: f.templateVersion,
    model: f.model,
    modelRevision: f.modelRevision,
    context: f.context,
    answers: {
      decision: {
        type: "choice",
        choice: selected,
        confidence: 0.99,
        probabilities: Object.fromEntries(
          options.map((id) => [id, id === selected ? 1 : 0]),
        ),
      },
      evidence_sufficient: { type: "noul", noul: 0.99 },
    },
    usage: { input_tokens: 100, output_tokens: 40 },
  };
}
export const bindingContext = (): BindingContext => ({
  current: context,
  request: "Search EQP001 yesterday",
  sensitiveSpans: [],
  admittedAt: "2026-10-19T03:00:00Z",
  timezone: "Asia/Seoul",
  approved: new Map(),
  observed: new Map(),
});
export const literal = {
  kind: "user_span",
  start: 7,
  end: 13,
  spanDigest: digest("EQP001"),
  valueType: "string",
  unit: null,
};
