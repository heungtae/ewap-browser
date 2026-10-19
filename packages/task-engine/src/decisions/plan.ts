import { isReadStep } from "./mode-capabilities.js";
import { z } from "zod";
import {
  id,
  revision,
  contextSchema,
  stepSchema,
  type Candidate,
  type DecisionContext,
} from "./schema.js";
export const planRevisionSchema = z.strictObject({
  protocol: z.literal("wca.task/v1"),
  revision,
  context: contextSchema,
  steps: z.array(stepSchema).max(64),
  allowedScopeIds: z.array(id).min(1).max(8),
  allowedOrigins: z.array(z.url()).max(8),
  allowedTabRefs: z.array(id).max(8),
  sourceCandidateIds: z.array(id).max(32),
  evidenceRefs: z.array(id).max(128),
  unresolvedInputs: z.array(id).max(64),
  goalPredicates: z.array(id).max(64),
  reservations: z.strictObject({
    toolInvocations: revision.max(64),
    mutations: revision.max(12),
  }),
});
export function validateFragment(
  candidate: Candidate,
  context: DecisionContext,
): "VALID" | "NEED_INPUT" {
  if (
    candidate.scopeId !== context.scopeId ||
    !candidate.modes.includes(context.mode)
  )
    throw new Error("PLAN_SCOPE_MISMATCH");
  const seen = new Set<string>();
  for (const step of candidate.steps) {
    if (
      seen.has(step.id) ||
      step.dependencies.some((id) => !seen.has(id)) ||
      (context.mode === "ask" && !isReadStep(step))
    )
      throw new Error("CYCLIC_UNORDERED_OR_FORBIDDEN_PLAN");
    seen.add(step.id);
  }
  if (candidate.steps.filter((step) => step.effect !== "read").length > 12)
    throw new Error("PLAN_MUTATION_LIMIT");
  return candidate.unresolvedInputs.length ? "NEED_INPUT" : "VALID";
}
export const planRevisionJsonSchema = z.toJSONSchema(planRevisionSchema);
