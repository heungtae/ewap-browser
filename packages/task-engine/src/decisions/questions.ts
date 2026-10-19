import { controls, type DecisionFrame, type Phase } from "./schema.js";
import { validateFrame } from "./frame.js";
const instructions: Record<Phase, string> = {
  intent: "Classify the current request using the supplied intent candidates.",
  evidence_sufficiency:
    "Select the supplied evidence verdict. Missing or partial required evidence is insufficient.",
  semantic_selection:
    "Select the candidate meaning supported by the stated observed facts; names alone cannot prove execution identity.",
  semantic_relation:
    "Select the supported relation candidate; inferred relations do not grant execution authority.",
  next_tool:
    "Select the next registered tool/plan fragment that meets the current request and facts. Never invent arguments or tools.",
  processor:
    "Select RUNTIME for deterministic extraction, aggregation and direct search. Select GPT_ANALYSIS only for complex evidence-based interpretation; it cannot plan browser actions.",
  recovery:
    "Select bounded inspection, replan or stop. Never repeat an ambiguous or already dispatched mutation.",
  result_acceptance:
    "Select ACCEPT only if current required goal predicates and evidence are satisfied; otherwise select REJECT or inspect.",
};
export function nativeRequest(frame: DecisionFrame) {
  validateFrame(frame);
  const criteria: Record<string, string> = Object.fromEntries(
    frame.candidateSet.candidates.map((c) => [
      c.id,
      `${c.meaning ?? c.semanticId}: ${c.description}`,
    ]),
  );
  Object.assign(criteria, {
    INSPECT_MORE:
      "Inspect further or request the next bounded candidate page; omissions do not prove absence",
    NEED_INPUT: "User clarification or unresolved argument is needed",
    UNSUPPORTED: "Request is outside supported candidate/binding capabilities",
    UNKNOWN: "Cannot decide with sufficient confidence",
  });
  if (Object.keys(criteria).length > 32 || controls.some((id) => !criteria[id]))
    throw new Error("CANDIDATE_LIMIT");
  return {
    model: frame.model,
    state: frame,
    questions: {
      decision: {
        type: "choice" as const,
        instructions: `${instructions[frame.phase]} Select only a supplied ID. UNKNOWN, NEED_INPUT and UNSUPPORTED are valid. A selected fragment is a proposal, not an approval or dispatch.`,
        criteria,
      },
      evidence_sufficient: {
        type: "noul" as const,
        instructions:
          "Probability that the supplied current facts are sufficient for the selected decision. Missing fields, unresolved parameters or unknown coverage are insufficient. Do not assume omitted data or successful execution.",
      },
    },
  };
}
