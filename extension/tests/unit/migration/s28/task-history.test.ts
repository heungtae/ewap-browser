import { expect, it, vi } from "vitest";
import {
  taskHistoryReplaySchema,
  type TaskHistoryReplay,
} from "../../../../../packages/shared/src/bridge.js";
import { applyTaskHistory } from "../../../../../apps/chrome-extension/src/presentation/apply-task-history.js";
import { createTaskHistoryClient } from "../../../../../apps/chrome-extension/src/bridge/task-history-client.js";
import { unboundBootstrapResult } from "../../../../../apps/chrome-extension/src/bridge/api.js";
const id = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const state = {
  id,
  revision: 5,
  phase: "cancelled" as const,
  state: "TERMINAL" as const,
  actionVerified: false,
  goal: "unknown" as const,
  firstFailure: null,
};
const snapshot: TaskHistoryReplay = {
  schema: "wca.task-history/v1",
  taskId: id,
  streamId: id,
  events: [],
  cursor: 5,
  resync: true,
  hasMore: false,
  dispatchUnknown: true,
  snapshot: {
    schema: "wca.task-history/v1",
    taskId: id,
    revision: 5,
    history: state,
    dispatchUnknown: true,
  },
};
it("restores a closed task snapshot only to an explicitly task-bound supported view", () => {
  const history = vi.fn(),
    view = { history, status: vi.fn(), message: vi.fn() };
  expect(
    applyTaskHistory(taskHistoryReplaySchema.parse(snapshot), 2, id, view),
  ).toBe(5);
  expect(history).toHaveBeenCalledExactlyOnceWith(state, true, true);
  for (const taskId of [undefined, "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"])
    expect(() => applyTaskHistory(snapshot, 2, taskId, view)).toThrow(
      "HISTORY_BINDING",
    );
  expect(() => applyTaskHistory(snapshot, 6, id, view)).toThrow(
    "HISTORY_BINDING",
  );
  expect(() =>
    applyTaskHistory(snapshot, 2, id, { status: vi.fn(), message: vi.fn() }),
  ).toThrow("HISTORY_BINDING");
  expect(history).toHaveBeenCalledOnce();
  expect(() => unboundBootstrapResult("resumeEvents", snapshot)).toThrow(
    "UI_CONTEXT_REQUIRED",
  );
});
it("rejects mismatched task/revision/state, hidden authority and contradictory resync metadata", () => {
  for (const patch of [
    { taskId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" },
    { cursor: 4 },
    { resync: false },
    { hasMore: true },
    {
      snapshot: { ...snapshot.snapshot!, history: { ...state, token: "past" } },
    },
    {
      snapshot: {
        ...snapshot.snapshot!,
        history: { ...state, phase: "running" },
      },
    },
  ])
    expect(
      taskHistoryReplaySchema.safeParse({ ...snapshot, ...patch }).success,
    ).toBe(false);
});
it("binds readonly reads to task and cursor, validates before rendering, and requires contiguous pages", async () => {
  const send = vi.fn(async () => snapshot);
  const client = createTaskHistoryClient(id, send);
  expect(await client.resume(2)).toEqual(snapshot);
  expect(send).toHaveBeenCalledExactlyOnceWith({
    kind: "task.history",
    taskId: id,
    afterSequence: 2,
  });
  await expect(
    client.resume(2, "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb"),
  ).rejects.toThrow("TASK_HISTORY_BINDING");
  const replay = {
    ...snapshot,
    resync: false,
    snapshot: null,
    events: [
      { kind: "task_state" as const, sequence: 5, revision: 5, history: state },
    ],
  };
  const history = vi.fn(),
    view = { history, status: vi.fn(), message: vi.fn() };
  expect(() => applyTaskHistory(replay, 2, id, view)).toThrow("HISTORY_GAP");
  expect(history).not.toHaveBeenCalled();
  expect(applyTaskHistory(replay, 4, id, view)).toBe(5);
  expect(history).toHaveBeenCalledExactlyOnceWith(state, true, false);
  expect(applyTaskHistory({ ...replay, events: [] }, 5, id, view)).toBe(5);
  expect(history.mock.lastCall).toEqual([null, true, false]);
});
