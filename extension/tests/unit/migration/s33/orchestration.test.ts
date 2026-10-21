import { describe, expect, it } from "vitest";
import {
  admitOrchestration,
  reduceOrchestration,
  advanceTask,
  phases,
} from "../../../../../packages/task-engine/src/orchestration/index.js";
import { context, ready, initial, event, step, planning } from "./support.js";
describe("S33 isolated phase coordination", () => {
  it.each(["enabled", "configured", "qualified"] as const)(
    "rejects admission when %s is missing",
    (key) => {
      expect(() =>
        admitOrchestration(context, { ...ready, [key]: false }, 1000, 0),
      ).toThrow("CONTROLLER_UNAVAILABLE");
    },
  );
  it("admits both modes through the same readiness gate", () => {
    for (const mode of ["ask", "act"] as const)
      expect(
        admitOrchestration({ ...context, mode }, ready, 1000, 0).context.mode,
      ).toBe(mode);
  });
  it("rejects every terminal transition", () => {
    for (const phase of ["completed", "failed", "cancelled"] as const)
      for (const next of phases)
        expect(() => step({ ...initial(), phase }, next)).toThrow(
          "TASK_TERMINAL",
        );
  });
  it("rejects invalid routes, stale revisions and untrusted acceptance", () => {
    expect(() => step(initial(), "planning", "runtime")).toThrow(
      "ILLEGAL_TRANSITION",
    );
    expect(() => step(planning(), "completed")).toThrow("TRANSITION_AUTHORITY");
    const s = planning();
    expect(() =>
      reduceOrchestration(
        s,
        { ...event(s, "analysis"), expectedRevision: 0 },
        1,
      ),
    ).toThrow("REVISION_CONFLICT");
  });
  it("journals before publishing and propagates failed CAS", async () => {
    const s = initial();
    const commits: unknown[] = [];
    const next = await advanceTask(
      s,
      event(s, "intent_classification", "runtime"),
      {
        commit: async (e) => {
          commits.push(e);
        },
      },
      1,
    );
    expect(commits).toHaveLength(1);
    expect(next.context.taskRevision).toBe(1);
    expect(s.context.taskRevision).toBe(0);
    await expect(
      advanceTask(
        s,
        event(s, "intent_classification", "runtime"),
        {
          commit: async () => {
            throw Error("REVISION_CONFLICT");
          },
        },
        1,
      ),
    ).rejects.toThrow("REVISION_CONFLICT");
  });
});
