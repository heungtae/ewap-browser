import { describe, expect, it } from "vitest";
import { reduceOrchestration } from "../../../../../packages/task-engine/src/orchestration/index.js";
import { context, event, step, planning, receipt } from "./support.js";
describe("S33 recovery and acceptance", () => {
  it("preserves verified steps and blocks a repeated dispatch after a goal mismatch", () => {
    let s = receipt("VERIFIED");
    s = step(s, "planning");
    expect(() =>
      reduceOrchestration(
        s,
        {
          ...event(s, "tool_execution"),
          step: { id: "step", status: "VERIFIED" },
        },
        1,
      ),
    ).toThrow("DISPATCH_REPLAY_FORBIDDEN");
    expect(s.verifiedSteps).toEqual(["step"]);
    expect(s.outcome).toBe("PENDING");
  });
  it("preserves ambiguous dispatches through suspension and rejects completion", () => {
    let s = receipt("UNKNOWN");
    s = step(s, "suspended", "runtime");
    s = step(s, "result_verification", "runtime");
    s = step(s, "result_acceptance");
    const complete = {
      ...event(s, "completed", "runtime"),
      acceptance: {
        context: s.context,
        requested: ["goal"],
        verified: ["goal"],
        analysisRequired: false,
        analysisAccepted: false,
      },
    };
    expect(() => reduceOrchestration(s, complete, 1)).toThrow(
      "GOAL_NOT_VERIFIED",
    );
    expect(step(s, "failed", "runtime").outcome).toBe("UNKNOWN");
  });
  it("requires fresh independent predicates and analysis for final acceptance", () => {
    const s = step(receipt("VERIFIED"), "result_acceptance");
    const a = {
      context: s.context,
      requested: ["goal"],
      verified: ["goal"],
      analysisRequired: true,
      analysisAccepted: false,
    };
    expect(() =>
      reduceOrchestration(
        s,
        { ...event(s, "completed", "runtime"), acceptance: a },
        1,
      ),
    ).toThrow("GOAL_NOT_VERIFIED");
    const complete = {
      ...event(s, "completed", "runtime"),
      acceptance: { ...a, analysisAccepted: true },
    };
    expect(reduceOrchestration(s, complete, 1).outcome).toBe("VERIFIED");
    expect(() =>
      reduceOrchestration(
        s,
        {
          ...complete,
          acceptance: {
            ...complete.acceptance,
            context: { ...context, evidenceRevision: 0 },
          },
        },
        1,
      ),
    ).toThrow("GOAL_NOT_VERIFIED");
  });
  it("never blindly resumes an interrupted dispatch", () => {
    let s = planning();
    s = reduceOrchestration(
      s,
      {
        ...event(s, "tool_execution"),
        step: { id: "step", status: "VERIFIED" },
      },
      1,
    );
    s = step(s, "suspended", "runtime");
    expect(() => step(s, "tool_execution", "runtime")).toThrow(
      "DISPATCH_RECONCILIATION_REQUIRED",
    );
  });
  it("bounds repeated observations and retains first failure", () => {
    let s = planning();
    s = reduceOrchestration(
      s,
      {
        ...event(s, "waiting_input"),
        progressDigest: "a".repeat(64),
        reason: "MISSING_INPUT",
      },
      1,
    );
    s = reduceOrchestration(
      s,
      { ...event(s, "planning", "user"), progressDigest: "a".repeat(64) },
      1,
    );
    s = reduceOrchestration(
      s,
      { ...event(s, "waiting_input"), progressDigest: "a".repeat(64) },
      1,
    );
    expect(s.firstFailure).toBe("MISSING_INPUT");
    expect(() =>
      reduceOrchestration(
        s,
        { ...event(s, "planning", "user"), progressDigest: "a".repeat(64) },
        1,
      ),
    ).toThrow("NO_PROGRESS");
    expect(step(s, "failed", "runtime").firstFailure).toBe("MISSING_INPUT");
  });
});
