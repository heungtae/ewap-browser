import { describe, expect, it } from "vitest";
import { consumeAssessment } from "../../../src/service-worker/act-assessment-budget.js";
import { logicalActionResults } from "../../../src/service-worker/act-logical-results.js";
import { validActCompletion } from "../../../src/contracts/act-completion.js";
import { actionOutcome } from "../../../src/service-worker/act-goal-finalizer.js";
import {
  parseElementAssessment,
  elementAssessmentTool,
} from "../../../src/service-worker/act-element-assessment.js";
import { setupAssessment } from "./s21-assessment-support.js";

describe("S21 shared contracts and recovery", () => {
  it("shares call, phase, read and deadline budget without resetting between observations", () => {
    const { session } = setupAssessment();
    consumeAssessment(session, "element", "step");
    consumeAssessment(session, "element", "step");
    expect(() => consumeAssessment(session, "element", "step")).toThrow();
    consumeAssessment(session, "action", "step");
    consumeAssessment(session, "goal");
    expect(() => consumeAssessment(session, "goal")).toThrow();
    consumeAssessment(session, "action", "step", true);
    consumeAssessment(session, "goal", "goal", true);
    expect(() => consumeAssessment(session, "goal", "goal", true)).toThrow();
    session.assessmentBudget!.deadline = Date.now() - 1;
    expect(() => consumeAssessment(session, "goal")).toThrow();
    expect(session.assessmentBudget!.calls).toBe(4);
  });
  it.each(["dispatched", "unknown", "not_dispatched"] as const)(
    "recovers only a proven pre-dispatch rejection (%s)",
    (dispatch) => {
      const { session } = setupAssessment();
      const attempt = session.executionEvidence![0]!;
      attempt.outcome = "FAILED";
      attempt.verifier = "failed";
      attempt.dispatch = dispatch;
      attempt.code = "TARGET_NOT_ACTIONABLE";
      attempt.logical_step_id = "step";
      session.executionEvidence!.push({
        ...attempt,
        action_id: "alternative",
        outcome: "VERIFIED",
        verifier: "satisfied",
        dispatch: "dispatched",
        dispatched: true,
        observed: true,
      });
      expect(actionOutcome(session)).toBe(
        dispatch === "not_dispatched" ? "VERIFIED" : "FAILED",
      );
      expect(session.executionEvidence).toHaveLength(2);
      expect(logicalActionResults(session.executionEvidence!)).toHaveLength(1);
    },
  );
  it("reads legacy completion and accepts only bounded versioned summaries", () => {
    const legacy = {
      action_outcome: "VERIFIED",
      goal_status: "completed",
      reason: "GOAL_OBSERVED",
      reassessments: 1,
    };
    expect(validActCompletion(legacy)).toBe(true);
    const newer = {
      ...legacy,
      assessment: {
        version: 1,
        calls: 4,
        reads: 2,
        confirmation: "llm_evidence",
      },
    };
    expect(validActCompletion(newer)).toBe(true);
    expect(
      validActCompletion({
        ...newer,
        assessment: { ...newer.assessment, calls: 5 },
      }),
    ).toBe(false);
    expect(validActCompletion({ ...newer, raw_packet: "secret" })).toBe(false);
    expect(
      validActCompletion({
        ...newer,
        assessment: { ...newer.assessment, approval: true },
      }),
    ).toBe(false);
  });
  it("element assessment can propose only an offered action and preserves normal arguments", () => {
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "propose_click",
          description: "Click",
          parameters: { type: "object" },
        },
      },
    ];
    expect(elementAssessmentTool("observation", tools).function.name).toBe(
      "assess_element",
    );
    const value = {
      phase: "element",
      observation_id: "observation",
      decision: "propose_action",
      rationale: "Button implementation",
      expected_observation: "Panel opens",
      evidence_ids: ["observation"],
      action: {
        name: "propose_click",
        arguments: { target: "ref", approval_scope: "single_step" },
      },
    };
    const call = {
      id: "call",
      name: "assess_element",
      arguments: JSON.stringify(value),
    };
    expect(
      parseElementAssessment(call, "observation", tools).call,
    ).toMatchObject({ id: "call", name: "propose_click" });
    expect(() => parseElementAssessment(call, "stale", tools)).toThrow();
    expect(() => parseElementAssessment(call, "observation", [])).toThrow();
  });
});
