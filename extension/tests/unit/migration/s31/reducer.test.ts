import { expect, it } from "vitest";
import {
  reduceTask,
  account,
  type Task,
} from "../../../../../packages/task-engine/src/durable/index.js";
const task: Task = {
  id: "task",
  admission: {
    requestId: "request",
    digest: "a".repeat(64),
    owner: "owner",
    profileId: "profile",
    tabId: 1,
    mode: "act",
    deadline: 1000,
    activeLimit: 20,
    attemptLimit: 1,
  },
  revision: 1,
  phase: "running",
  epoch: 1,
  generation: 0,
  leaseId: "lease",
  leaseUntil: 1000,
  activeUsed: 0,
  attempts: 0,
  accountedAt: 0,
  terminalAt: null,
  firstFailure: null,
  actionVerified: false,
  goal: "unknown",
};
it("S31 every terminal phase rejects every event and model claims cannot complete a task", () => {
  const events = [
    "started",
    "prompt",
    "resumed",
    "suspended",
    "completed",
    "failed",
    "cancelled",
    "action_verified",
    "goal_incomplete",
  ] as const;
  for (const phase of ["completed", "failed", "cancelled"] as const)
    for (const type of events)
      expect(() =>
        reduceTask(
          { ...task, phase },
          { type, correlationId: "call", code: null },
          1,
        ),
      ).toThrow("TASK_TERMINAL");
  expect(() =>
    reduceTask(
      task,
      { type: "completed", correlationId: "call", code: null },
      1,
    ),
  ).toThrow("GOAL_ACCEPTANCE_UNAVAILABLE");
});
it("S31 retry and elapsed budgets cannot reset with repeated snapshots or backwards clocks", () => {
  const charged = account(task, 10, true);
  expect(charged).toMatchObject({ activeUsed: 10, attempts: 1 });
  expect(() => account(charged, 11, true)).toThrow("BUDGET_EXHAUSTED");
  expect(() => account(charged, 21, false)).toThrow("BUDGET_EXHAUSTED");
  expect(() => account(charged, 9, false)).toThrow("CLOCK_REGRESSION");
  expect(() => account(charged, 1000, false)).toThrow("TASK_EXPIRED");
});
