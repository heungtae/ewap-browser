import { isReadStep } from "./mode-capabilities.js";
import {
  candidateSchema,
  cursorSchema,
  contextSchema,
  controls,
  pageSchema,
  type Candidate,
  type DecisionContext,
  type CandidatePage,
} from "./schema.js";
import { digest } from "./digest.js";
export type CandidateEligibility = {
  candidate: Candidate;
  policyPermitted: boolean;
  uniqueTarget: boolean;
  fresh: boolean;
  userMentionMatch: number;
  workflowMatch: boolean;
  evidenceTime: number;
  resolvedParameters?: readonly string[];
};
export function enumerateCandidates(
  context: DecisionContext,
  inputs: readonly CandidateEligibility[],
  capabilities: ReadonlySet<string>,
  cursor?: CandidatePage["cursor"],
): CandidatePage {
  contextSchema.parse(context);
  if (cursor) cursorSchema.parse(cursor);
  const ids = new Set<string>(),
    semantics = new Set<string>();
  const eligible = inputs
    .flatMap((input) => {
      const c = candidateSchema.parse(input.candidate);
      if (
        ids.has(c.id) ||
        semantics.has(c.semanticId) ||
        controls.includes(c.id as (typeof controls)[number])
      )
        throw new Error("DUPLICATE_OR_CONTROL_CANDIDATE");
      ids.add(c.id);
      semantics.add(c.semanticId);
      if (
        !Number.isSafeInteger(input.userMentionMatch) ||
        input.userMentionMatch < 0 ||
        !Number.isSafeInteger(input.evidenceTime)
      )
        throw new Error("INVALID_RANK");
      if (
        c.scopeId !== context.scopeId ||
        !c.modes.includes(context.mode) ||
        !input.policyPermitted ||
        !input.fresh ||
        !c.capabilityRefs.every((ref) => capabilities.has(ref))
      )
        return [];
      if (context.mode === "ask" && c.steps.some((s) => !isReadStep(s)))
        return [];
      const missing = c.steps
        .flatMap((step) => step.parameters)
        .filter(
          (slot) =>
            !input.resolvedParameters?.includes(slot) ||
            !c.bindingDigests[slot],
        );
      const targeted = new Set([
        "web.navigate",
        "web.switch_tab",
        "web.click",
        "web.fill",
        "web.select",
        "web.invoke_action",
      ]);
      missing.push(
        ...c.steps
          .filter((step) => targeted.has(step.tool) && !step.actionRef)
          .map((step) => `target:${step.id}`),
      );
      c.unresolvedInputs = [...new Set([...c.unresolvedInputs, ...missing])];
      // Ambiguous mutations remain investigation/input work, never executable target choices.
      if (
        !input.uniqueTarget &&
        c.steps.some((s) => s.effect !== "read") &&
        !c.unresolvedInputs.includes("target_selection")
      )
        c.unresolvedInputs.push("target_selection");
      return [{ ...input, candidate: c }];
    })
    .sort(
      (a, b) =>
        b.userMentionMatch - a.userMentionMatch ||
        Number(b.workflowMatch) - Number(a.workflowMatch) ||
        b.evidenceTime - a.evidenceTime ||
        (a.candidate.semanticId < b.candidate.semanticId ? -1 : 1),
    );
  const contextDigest = digest(context),
    sourceDigest = digest(eligible);
  if (
    cursor &&
    (cursor.sourceDigest !== sourceDigest ||
      cursor.contextDigest !== contextDigest ||
      cursor.offset >= eligible.length ||
      cursor.offset <= 0 ||
      cursor.offset % 28 !== 0)
  )
    throw new Error("STALE_CURSOR");
  const offset = cursor?.offset ?? 0;
  const candidates = eligible
    .slice(offset, offset + 28)
    .map((entry) => entry.candidate);
  const payload = {
    sourceDigest,
    contextDigest,
    candidates,
    totalEligible: eligible.length,
    omitted: eligible.length - candidates.length,
    cursor:
      offset + 28 < eligible.length
        ? { sourceDigest, contextDigest, offset: offset + 28 }
        : null,
  };
  return pageSchema.parse({
    ...payload,
    id: `set:${digest(payload)}`,
    digest: digest(payload),
  });
}
