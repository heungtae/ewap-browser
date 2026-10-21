import { expect, it } from "vitest";
import { OrchestrationHistory } from "../../../../../packages/task-engine/src/orchestration/presentation.js";
import { receipt, step } from "./support.js";
it("S33 history deduplicates reconnect snapshots and preserves action/goal distinctions", () => {
  const history = new OrchestrationHistory();
  const state = receipt("VERIFIED");
  expect(history.accept(state)).toBe(true);
  expect(history.accept(state)).toBe(false);
  expect(history.view(state.context.taskId)).toMatchObject({
    outcome: "PENDING",
    verifiedSteps: ["step"],
    terminal: false,
  });
  const final = step(state, "failed", "runtime");
  expect(history.accept(final)).toBe(true);
  expect(history.accept(state)).toBe(false);
  expect(history.view(state.context.taskId)?.outcome).toBe("INCOMPLETE");
  expect(() =>
    history.accept({
      ...state,
      context: {
        ...state.context,
        taskRevision: final.context.taskRevision + 1,
      },
    }),
  ).toThrow("TASK_TERMINAL");
});
it("S33 presentation retains unknown dispatch instead of reporting verified goal", () => {
  const state = step(receipt("UNKNOWN"), "failed", "runtime");
  const history = new OrchestrationHistory();
  history.accept(state);
  expect(history.view(state.context.taskId)).toMatchObject({
    outcome: "UNKNOWN",
    dispatchUnknown: true,
  });
});
