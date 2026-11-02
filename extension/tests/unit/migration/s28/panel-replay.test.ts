import { expect, it, vi } from "vitest";
import {
  connectPresentation,
  type PresentationClock,
} from "../../../../../apps/chrome-extension/src/presentation/connection-loop.js";
import { unboundBootstrapResult } from "../../../../../apps/chrome-extension/src/bridge/api.js";
import type { TaskClient } from "../../../../../packages/shared/src/bridge.js";
const started = {
  runId: "run",
  requestId: "request",
  type: "run_started" as const,
  mode: "act" as const,
  permission_mode: "standard" as const,
};
const first = {
  sequence: 1,
  revision: 1,
  kind: "presentation" as const,
  presentation: started,
};
function fixture(resume: TaskClient["resume"], supportsEvents = true) {
  let pending: (() => void) | undefined;
  const event = vi.fn(),
    connection = vi.fn(),
    message = vi.fn();
  const state = { cursor: 0, snapshotRequired: false, connectionOnly: true };
  const clock: PresentationClock = {
    later(next) {
      pending = next;
      return next;
    },
    cancel() {
      pending = undefined;
    },
  };
  const client = vi.fn(resume);
  const stop = connectPresentation(
    {
      status: vi.fn(),
      message,
      connection,
      ...(supportsEvents ? { event } : {}),
    },
    { resume: client },
    {
      read: async () => ({
        controllerReady: true,
        analystReady: true,
        secretMode: "session-only",
      }),
    },
    clock,
    state,
  );
  const flush = async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  };
  return {
    event,
    connection,
    message,
    state,
    client,
    stop,
    flush,
    async tick() {
      const next = pending;
      pending = undefined;
      next?.();
      await flush();
    },
  };
}
it("replays typed events once across disconnects and permanently leaves connection-only recovery", async () => {
  let online = true;
  const f = fixture(async () => {
    if (!online) throw Error("PRIVATE");
    return { events: [first], cursor: 1, resync: false };
  });
  await f.flush();
  expect(f.event).toHaveBeenCalledExactlyOnceWith(started);
  expect(f.state).toMatchObject({ cursor: 1, connectionOnly: false });
  online = false;
  await f.tick();
  expect(f.connection.mock.lastCall?.[1]).toBe(false);
  online = true;
  await f.tick();
  expect(f.event).toHaveBeenCalledOnce();
  expect(f.client.mock.lastCall).toEqual([1]);
  expect(() =>
    unboundBootstrapResult("resumeEvents", {
      events: [first],
      cursor: 1,
      resync: false,
    }),
  ).toThrow("UI_CONTEXT_REQUIRED");
  f.stop();
});
it("validates the whole typed batch before rendering and never skips unsupported presentation", async () => {
  const invalid = fixture(async () => ({
    events: [
      first,
      {
        ...first,
        sequence: 2,
        presentation: { ...started, grant: "historical" },
      },
    ],
    cursor: 2,
    resync: false,
  }));
  await invalid.flush();
  expect(invalid.event).not.toHaveBeenCalled();
  expect(invalid.state.cursor).toBe(0);
  expect(invalid.state.snapshotRequired).toBe(true);
  invalid.stop();
  const unsupported = fixture(
    async () => ({ events: [first], cursor: 1, resync: false }),
    false,
  );
  await unsupported.flush();
  expect(unsupported.state.cursor).toBe(0);
  expect(unsupported.state.snapshotRequired).toBe(true);
  unsupported.stop();
});
it("rejects a typed replay gap and an unrelated stream without publishing any card", async () => {
  const f = fixture(async () => ({
    events: [first, { ...first, sequence: 3 }],
    cursor: 3,
    resync: false,
  }));
  await f.flush();
  expect(f.event).not.toHaveBeenCalled();
  expect(f.state.cursor).toBe(0);
  expect(f.connection.mock.lastCall?.[1]).toBe(false);
  f.stop();
});
