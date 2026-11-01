import { expect, it } from "vitest";
import { EventReplay } from "../../../../../apps/agent-server/src/ipc/replay.js";
import {
  connectPresentation,
  type PresentationState,
} from "../../../../../apps/chrome-extension/src/presentation/connection-loop.js";
const settings = {
  read: async () => ({
    controllerReady: false,
    analystReady: false,
    secretMode: "session-only" as const,
  }),
};
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
it("restores a bounded connection stream after retention gaps and a new daemon stream", async () => {
  let replay = new EventReplay(1, true);
  replay.append("browser.connected");
  replay.append("browser.waiting");
  const state: PresentationState = {
    cursor: 0,
    snapshotRequired: false,
    connectionOnly: true,
  };
  let tick: (() => void) | undefined;
  const statuses: string[] = [];
  const stop = connectPresentation(
    {
      message: () => {
        throw Error("TASK_DATA");
      },
      status: (text) => statuses.push(text),
    },
    { resume: async (cursor, stream) => replay.resume(cursor, stream) },
    settings,
    {
      later: (callback) => {
        tick = callback;
      },
      cancel: () => {},
    },
    state,
  );
  await flush();
  expect(state.cursor).toBe(2);
  expect(state.snapshotRequired).toBe(false);
  const original = state.streamId;
  replay = new EventReplay(1, true);
  tick!();
  await flush();
  expect(state.cursor).toBe(0);
  expect(state.streamId).not.toBe(original);
  expect(statuses.at(-1)).toBe("Backend connected — controller setup required");
  replay.append("browser.connected");
  tick!();
  await flush();
  expect(state.cursor).toBe(1);
  stop();
});
it("does not apply a connection-only snapshot to task history or generic clients", async () => {
  for (const connectionOnly of [undefined, false]) {
    const replay = new EventReplay(1, true);
    replay.append("browser.connected");
    const state: PresentationState = {
      cursor: 0,
      snapshotRequired: false,
      ...(connectionOnly === undefined ? {} : { connectionOnly }),
    };
    const stop = connectPresentation(
      { message: () => {}, status: () => {} },
      { resume: async () => replay.resume(0) },
      settings,
      { later: () => {}, cancel: () => {} },
      state,
    );
    await flush();
    expect(state.cursor).toBe(0);
    expect(state.snapshotRequired).toBe(true);
    stop();
  }
  expect(() => new EventReplay(1, true).append("message")).toThrow(
    "CONNECTION_EVENT_REQUIRED",
  );
});
it("refuses a snapshot whose revision does not cover the response cursor", async () => {
  const replay = new EventReplay(1, true);
  const batch = replay.resume(0);
  const state: PresentationState = {
    cursor: 0,
    snapshotRequired: false,
    connectionOnly: true,
  };
  const stop = connectPresentation(
    { message: () => {}, status: () => {} },
    { resume: async () => ({ ...batch, cursor: 5 }) },
    settings,
    { later: () => {}, cancel: () => {} },
    state,
  );
  await flush();
  expect(state.cursor).toBe(0);
  expect(state.snapshotRequired).toBe(true);
  stop();
});
it("keeps task-bearing history blocked when a later connection snapshot arrives", async () => {
  const state: PresentationState = {
    cursor: 0,
    snapshotRequired: false,
    connectionOnly: true,
  };
  const replay = new EventReplay(1, true);
  let count = 0;
  let tick: (() => void) | undefined;
  const messages: string[] = [];
  const stop = connectPresentation(
    { message: (text) => messages.push(text), status: () => {} },
    {
      resume: async () =>
        ++count === 1
          ? {
              events: [
                {
                  sequence: 1,
                  revision: 1,
                  kind: "message",
                  text: "observed task",
                },
              ],
              cursor: 1,
              resync: false,
            }
          : replay.resume(1),
    },
    settings,
    {
      later: (callback) => {
        tick = callback;
      },
      cancel: () => {},
    },
    state,
  );
  await flush();
  expect(state.connectionOnly).toBe(false);
  tick!();
  await flush();
  expect(state.cursor).toBe(1);
  expect(state.snapshotRequired).toBe(true);
  expect(messages).toEqual(["observed task"]);
  stop();
});
