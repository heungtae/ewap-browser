import { expect, it } from "vitest";
import {
  phases,
  reduceOrchestration,
  type Phase,
  type Transition,
} from "../../../../../packages/task-engine/src/orchestration/index.js";
import { initial, event } from "./support.js";
const routes: Partial<Record<Phase, Phase[]>> = {
  admission: ["intent_classification"],
  intent_classification: ["codebase_discovery", "waiting_input"],
  codebase_discovery: ["planning"],
  planning: ["approval_pending", "tool_execution", "analysis", "waiting_input"],
  approval_pending: ["planning", "tool_execution"],
  waiting_input: ["planning", "tool_execution"],
  tool_execution: ["result_verification"],
  result_verification: ["planning", "analysis", "result_acceptance"],
  analysis: ["result_acceptance", "planning"],
  result_acceptance: ["completed"],
};
function role(phase: Phase): Transition["role"] {
  if (["admission", "tool_execution"].includes(phase)) return "runtime";
  if (["approval_pending", "waiting_input"].includes(phase)) return "user";
  return phase === "analysis" ? "analyst" : "jev";
}
it("S33 reference phase matrix permits declared routes and rejects every undeclared route", () => {
  for (const [source, destinations] of Object.entries(routes)) {
    const phase = source as Phase;
    const state = { ...initial(), phase, activeStep: "step" };
    for (const next of phases.filter(
      (p) => !["suspended", "cancelled", "failed"].includes(p),
    )) {
      const e: Transition = {
        ...event(state, next, next === "completed" ? "runtime" : role(phase)),
        step: { id: "step", status: "VERIFIED" },
        acceptance: {
          context: state.context,
          requested: ["goal"],
          verified: ["goal"],
          analysisRequired: false,
          analysisAccepted: false,
        },
      };
      if (destinations.includes(next))
        expect(reduceOrchestration(state, e, 1).phase).toBe(next);
      else expect(() => reduceOrchestration(state, e, 1)).toThrow();
    }
  }
});
it("S33 every active phase supports interruption and cannot advance after its deadline", () => {
  for (const phase of Object.keys(routes) as Phase[]) {
    const state = { ...initial(), phase };
    expect(
      reduceOrchestration(state, event(state, "suspended", "runtime"), 1)
        .resumePhase,
    ).toBe(phase);
    for (const next of ["cancelled", "failed"] as const)
      expect(
        reduceOrchestration(state, event(state, next, "runtime"), 1001).phase,
      ).toBe(next);
    expect(() =>
      reduceOrchestration(state, event(state, "suspended", "runtime"), 1001),
    ).toThrow("TASK_EXPIRED");
  }
});
