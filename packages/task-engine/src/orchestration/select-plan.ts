import { bindFragment } from "../decisions/bind-fragment.js";
import type { BindingContext } from "../decisions/bind-argument.js";
import { digest } from "../decisions/digest.js";
import { acceptResult } from "../decisions/accept-result.js";
import { planRevisionSchema } from "../decisions/plan.js";
import type { DecisionController } from "../decisions/controller.js";
import type { DecisionFrame, Candidate } from "../decisions/schema.js";
export interface PlanScope {
  origins: string[];
  tabRefs: string[];
  // Derived from the shared registry and live task ownership, never a recipe.
  availableTools: ReadonlySet<Candidate["steps"][number]["tool"]>;
}
export async function selectPlan(
  controller: DecisionController,
  frame: DecisionFrame,
  current: () => BindingContext,
  sources: ReadonlyMap<string, unknown>,
  scope: PlanScope,
  signal?: AbortSignal,
) {
  const outcome = await controller.evaluate(frame, signal);
  if (outcome.outcome !== "SELECTED" || !outcome.decision)
    return { status: outcome.outcome, firstFailure: outcome.firstFailure };
  const binding = current();
  if (signal?.aborted || digest(binding.current) !== digest(frame.context))
    throw new Error("PLAN_CONTEXT_STALE");
  const selected = acceptResult(frame, outcome.decision.result);
  if (selected.outcome !== "SELECTED")
    throw new Error("PLAN_SELECTION_INVALID");
  const candidate = frame.candidateSet.candidates.find(
    (c) => c.id === selected.selection,
  );
  if (!candidate) throw new Error("PLAN_CANDIDATE_MISSING");
  if (candidate.steps.some((s) => !scope.availableTools.has(s.tool)))
    throw new Error("CAPABILITY_UNAVAILABLE");
  const bound = bindFragment(candidate, sources, binding);
  if (bound.status !== "BOUND")
    return { status: "NEED_INPUT", missing: bound.missing };
  const plan = planRevisionSchema.parse({
    protocol: "wca.task/v1",
    revision: frame.context.planRevision + 1,
    context: { ...frame.context, planRevision: frame.context.planRevision + 1 },
    steps: candidate.steps,
    allowedScopeIds: [frame.context.scopeId],
    allowedOrigins: scope.origins,
    allowedTabRefs: scope.tabRefs,
    sourceCandidateIds: [candidate.id],
    evidenceRefs: candidate.evidenceRefs,
    unresolvedInputs: [],
    goalPredicates: [
      ...new Set(candidate.steps.flatMap((s) => s.goalPredicateRefs)),
    ],
    reservations: {
      toolInvocations: candidate.steps.length,
      mutations: candidate.steps.filter((s) => s.effect !== "read").length,
    },
  });
  // A plan is a proposal. Only the shared runtime can prepare/approve/dispatch it.
  return { status: "PLANNED", plan, arguments: bound.arguments };
}
