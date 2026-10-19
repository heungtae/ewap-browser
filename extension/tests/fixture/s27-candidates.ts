import {
  type Phase,
  type Candidate,
} from "../../../packages/task-engine/src/decisions/index.js";
import { type HoldoutCase } from "./s27-binding-context.js";
const vocab: Record<string, string> = {
  READ: "Read the existing data without changing page state",
  ACTION:
    "Search for user-specified equipment by filling and submitting a form",
  ANALYSIS:
    "Analyze yesterday's alarms, including date-filter acquisition and complex interpretation",
  RUNTIME: "Use deterministic runtime only, without GPT",
  GPT_ANALYSIS:
    "Delegate evidence-based complex interpretation to the analyst after permitted data acquisition; never use it for browser control",
  SEARCH_FORM: "Observed equipment Search form and its controls",
  RESULT_COLLECTION: "Current equipment alarm results collection",
  FILTER_CONTROL: "Alarm date filter controls",
  ACCEPT:
    "Current required evidence and verified goal predicates are satisfied",
  REJECT: "Goal predicates or required evidence are not satisfied",
  STOP: "Stop after an ambiguous prior mutation; never repeat it",
  INSPECT: "Inspect more evidence without repeating a mutation",
  REPLAN: "Replan an undispatched step within the same budget",
};
export const idsByPhase: Record<Phase, string[]> = {
  intent: ["READ", "ACTION", "ANALYSIS"],
  evidence_sufficiency: ["ACCEPT", "REJECT"],
  semantic_selection: ["SEARCH_FORM", "RESULT_COLLECTION", "FILTER_CONTROL"],
  semantic_relation: ["SEARCH_FORM", "RESULT_COLLECTION", "FILTER_CONTROL"],
  next_tool: ["aggregate", "equipment_search", "dated_alarms"],
  processor: ["RUNTIME", "GPT_ANALYSIS"],
  recovery: ["STOP", "INSPECT", "REPLAN"],
  result_acceptance: ["ACCEPT", "REJECT"],
};
export function scenarioCandidates(c: HoldoutCase, phase: Phase): Candidate[] {
  return idsByPhase[phase].map((id): Candidate => {
    const base: Candidate = {
      id,
      semanticId: id,
      description: vocab[id] ?? id,
      source: "registered",
      scopeId: "alarm-page",
      modes: ["ask", "act"],
      capabilityRefs: ["qualified-fixture"],
      evidenceRefs: ["observed-alarm-page"],
      unresolvedInputs: [],
      bindingDigests: {},
      steps: [],
    };
    if (phase !== "next_tool")
      return { ...base, meaning: id as NonNullable<Candidate["meaning"]> };
    const step = (
      name: string,
      tool: Candidate["steps"][number]["tool"],
      effect: Candidate["steps"][number]["effect"],
      parameters: string[],
      dependencies: string[] = [],
    ) => ({
      id: name,
      actionRef: `registered:${name}`,
      tool,
      effect,
      parameters,
      dependencies,
      preconditionRefs: ["fixture-current-capability"],
      goalPredicateRefs: ["current-result-verified"],
    });
    if (id === "aggregate")
      return {
        ...base,
        description:
          "Read the current alarms dataset and deterministically group/count by equipment, return maxima and ties with coverage; no form changes",
        steps: [
          step("table", "web.get_table_data", "read", ["dataset"]),
          step("group-count", "web.query", "read", ["dataset"], ["table"]),
        ],
      };
    if (id === "equipment_search")
      return {
        ...base,
        description:
          "Fill the equipment Search field with the exact user equipment ID, click Search once and verify the current filtered grid",
        modes: ["act"],
        steps: [
          step("fill", "web.fill", "local-ui", ["equipment"]),
          step("submit", "web.click", "external", [], ["fill"]),
          step("verify", "task.verify", "read", [], ["submit"]),
        ],
      };
    return {
      ...base,
      description:
        "Set the alarm date filter to the bound previous local calendar day, read all permitted rows and verify coverage for later complex analysis",
      modes: ["act"],
      steps: [
        step("date", "web.select", "local-ui", ["date_range"]),
        step("read", "web.get_table_data", "read", ["dataset"], ["date"]),
      ],
    };
  });
}
