import { decisionResultSchema, type DecisionResult } from "./port.js";
import { controls, type DecisionFrame } from "./schema.js";
import { digest } from "./digest.js";
import { validateFrame } from "./frame.js";
import { validateFragment } from "./plan.js";
export type AcceptedDecision = {
  outcome: "SELECTED" | (typeof controls)[number];
  selection: string;
  result: DecisionResult;
  reason?: string;
};
export function acceptResult(
  frame: DecisionFrame,
  input: unknown,
): AcceptedDecision {
  validateFrame(frame);
  const result = decisionResultSchema.parse(input);
  if (
    result.frameDigest !== frame.digest ||
    result.candidateDigest !== frame.candidateSet.digest ||
    result.templateVersion !== frame.templateVersion ||
    result.model !== frame.model ||
    result.modelRevision !== frame.modelRevision ||
    digest(result.context) !== digest(frame.context)
  )
    throw new Error("FOREIGN_OR_STALE_RESULT");
  const options = [
    ...frame.candidateSet.candidates.map((c) => c.id),
    ...controls,
  ];
  const choice = result.answers.decision,
    probabilities = choice.probabilities;
  if (
    Object.keys(probabilities).length !== options.length ||
    !options.every((key) => Object.hasOwn(probabilities, key)) ||
    !options.includes(choice.choice) ||
    Math.abs(Object.values(probabilities).reduce((a, b) => a + b, 0) - 1) >
      0.01 ||
    Object.values(probabilities).some(
      (p) => p > probabilities[choice.choice]! + 0.000001,
    )
  )
    throw new Error("INVALID_NATIVE_DISTRIBUTION");
  const reason = !frame.stateComplete
    ? "INCOMPLETE_STATE"
    : !frame.candidateSet.candidates.length
      ? "EMPTY_CANDIDATES"
      : choice.confidence < 0.9
        ? "LOW_CONFIDENCE"
        : probabilities[choice.choice]! < 0.9
          ? "LOW_SELECTED_PROBABILITY"
          : result.answers.evidence_sufficient.noul < 0.9
            ? "INSUFFICIENT_EVIDENCE"
            : undefined;
  if (reason)
    return { outcome: "UNKNOWN", selection: "UNKNOWN", result, reason };
  if (choice.choice === "UNSUPPORTED" && frame.candidateSet.omitted > 0)
    return {
      outcome: "INSPECT_MORE",
      selection: "INSPECT_MORE",
      result,
      reason: "CANDIDATES_OMITTED",
    };
  if (controls.includes(choice.choice as (typeof controls)[number]))
    return {
      outcome: choice.choice as (typeof controls)[number],
      selection: choice.choice,
      result,
    };
  const candidate = frame.candidateSet.candidates.find(
    (c) => c.id === choice.choice,
  )!;
  const status = validateFragment(candidate, frame.context);
  return {
    outcome: status === "NEED_INPUT" ? "NEED_INPUT" : "SELECTED",
    selection: candidate.id,
    result,
  };
}
