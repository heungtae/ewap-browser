import { describe, expect, it, vi } from "vitest";
import {
  connectPresentation,
  type PresentationClock,
} from "../../../../../apps/chrome-extension/src/presentation/connection-loop.js";
import type { TaskClient } from "../../../../../packages/shared/src/bridge.js";
function fixture(
  resume: TaskClient["resume"],
  read = async () => ({
    controllerReady: false,
    analystReady: false,
    secretMode: "session-only" as const,
  }),
) {
  const messages: string[] = [],
    statuses: string[] = [];
  let pending: (() => void) | undefined;
  const timer: PresentationClock = {
    later(callback) {
      pending = callback;
      return callback;
    },
    cancel() {
      pending = undefined;
    },
  };
  const task = vi.fn(resume),
    settings = vi.fn(read);
  const stop = connectPresentation(
    {
      message: (text) => messages.push(text),
      status: (text) => statuses.push(text),
    },
    { resume: task },
    { read: settings },
    timer,
  );
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  return {
    messages,
    statuses,
    task,
    settings,
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
const event = {
  sequence: 1,
  revision: 1,
  kind: "message",
  text: "read-only observation",
};
describe("presentation reconnect lifecycle", () => {
  it("recovers after disconnect without replaying messages", async () => {
    let online = true;
    const f = fixture(async () => {
      if (!online) throw new Error("offline");
      return { events: [event], cursor: 1, resync: false };
    });
    await f.flush();
    online = false;
    await f.tick();
    expect(f.statuses.at(-1)).toContain("disconnected");
    online = true;
    await f.tick();
    expect(f.statuses.at(-1)).toContain("controller setup required");
    expect(f.messages).toEqual([event.text]);
    expect(f.task.mock.calls.at(-1)).toEqual([1]);
    f.stop();
  });
  it("ignores late replies after unmount and schedules no new work", async () => {
    let resolve:
      | ((value: Awaited<ReturnType<TaskClient["resume"]>>) => void)
      | undefined;
    const f = fixture(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    f.stop();
    resolve!({ events: [event], cursor: 1, resync: false });
    await f.flush();
    await f.tick();
    expect(f.messages).toEqual([]);
    expect(f.statuses).toEqual([]);
    expect(f.task).toHaveBeenCalledTimes(1);
  });
  it("never overlaps an unresolved request pair", async () => {
    const f = fixture(() => new Promise(() => undefined));
    await f.flush();
    await f.tick();
    expect(f.task).toHaveBeenCalledTimes(1);
    expect(f.settings).toHaveBeenCalledTimes(1);
    f.stop();
  });
  it("validates the whole batch before rendering or advancing on a gap", async () => {
    const f = fixture(async () => ({
      events: [event, { ...event, sequence: 3 }],
      cursor: 3,
      resync: false,
    }));
    await f.flush();
    expect(f.messages).toEqual([]);
    expect(f.statuses.at(-1)).toContain("snapshot required");
    await f.tick();
    expect(f.task.mock.calls.at(-1)).toEqual([0]);
    f.stop();
  });
  it("retains snapshot-required status instead of claiming complete history", async () => {
    let resync = true;
    const f = fixture(async () =>
      resync
        ? { events: [], cursor: 4, resync: true }
        : { events: [event], cursor: 1, resync: false },
    );
    await f.flush();
    resync = false;
    await f.tick();
    expect(f.statuses.at(-1)).toContain("snapshot required");
    expect(f.messages).toEqual([]);
    f.stop();
  });
  it("does not show task data when settings transport failed", async () => {
    const f = fixture(
      async () => ({ events: [event], cursor: 1, resync: false }),
      async () => {
        throw new Error("PRIVATE_CANARY");
      },
    );
    await f.flush();
    expect(f.messages).toEqual([]);
    expect(f.statuses.at(-1)).not.toContain("PRIVATE_CANARY");
    f.stop();
  });
  it("retains the observation cursor across same-document remount", async () => {
    const messages: string[] = [];
    const resume = vi.fn(async () => ({
      events: [event],
      cursor: 1,
      resync: false,
    }));
    const settings = {
      read: async () => ({
        controllerReady: false,
        analystReady: false,
        secretMode: "session-only" as const,
      }),
    };
    const timer: PresentationClock = {
      later: () => undefined,
      cancel: () => undefined,
    };
    const state = { cursor: 0, snapshotRequired: false };
    const view = {
      message: (text: string) => messages.push(text),
      status: () => undefined,
    };
    const stop = connectPresentation(view, { resume }, settings, timer, state);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    stop();
    const remount = connectPresentation(
      view,
      { resume },
      settings,
      timer,
      state,
    );
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(resume.mock.calls[1]).toEqual([1]);
    expect(messages).toEqual([event.text]);
    remount();
  });
});
