import { describe, expect, it, vi } from "vitest";
import { createChatMessageHandler } from "../../../src/service-worker/chat-message-handler.js";

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createHandler = () => {
  const calls: string[] = [];
  const handler = createChatMessageHandler({
    activeTabForPanel: async () => ({ id: 7 }),
    cancelActiveTab: (tabId) => calls.push(`cancel:${tabId}`),
    chatEvents: {
      clear: () => calls.push("events:clear"),
      recoverable: (tabId) => [`event:${tabId}`],
      scope: (tabId) => ({ tabId }),
      sinceThreadForRun: (runId, sequence) => [`${runId}:${sequence}`],
    },
    chatPersistence: {
      clear: async () => {
        calls.push("persistence:clear");
      },
    },
    clearScheduledChatPersistence: () => calls.push("schedule:clear"),
    isPanelSender: (sender) => sender.url === "panel",
    providerAvailable: () => true,
    runActChat: async () => {
      calls.push("act");
      return { ok: true };
    },
    runAskChat: async () => {
      calls.push("ask");
      return { ok: true, run_id: "ask-run" };
    },
    safeFailure: (code, detail) => ({
      ok: false,
      code,
      ...(detail ? { detail } : {}),
    }),
  });
  return { calls, handler };
};

describe("chat runtime message handler", () => {
  it("leaves non-chat messages for another domain handler", () => {
    const { handler } = createHandler();
    const respond = vi.fn();

    expect(handler.handle({ kind: "START_PREVIEW" }, {}, respond)).toEqual({
      handled: false,
    });
    expect(respond).not.toHaveBeenCalled();
  });

  it("preserves closed-key and panel-sender checks before resync", () => {
    const { handler } = createHandler();
    const respond = vi.fn();

    expect(
      handler.handle(
        { kind: "CHAT_RESYNC", run_id: "run", sequence: 0, extra: true },
        { url: "panel" },
        respond,
      ),
    ).toEqual({ handled: true });
    expect(respond).toHaveBeenCalledWith({
      ok: false,
      code: "INVALID_ARGUMENT",
    });
  });

  it("keeps act acknowledgement and asynchronous response semantics", async () => {
    const { calls, handler } = createHandler();
    const respond = vi.fn();

    expect(
      handler.handle(
        { kind: "CHAT_SEND", payload: { mode: "act", prompt: "run" } },
        { url: "panel" },
        respond,
      ),
    ).toEqual({ handled: true, keepAlive: true });
    await flush();
    expect(calls).toEqual(["act"]);
    expect(respond).toHaveBeenCalledWith({ ok: true });
  });

  it("recovers the active tab thread and clears it in the existing order", async () => {
    const { calls, handler } = createHandler();
    const recover = vi.fn();
    const clear = vi.fn();

    handler.handle({ kind: "CHAT_RECOVER" }, { url: "panel" }, recover);
    await flush();
    expect(recover).toHaveBeenCalledWith({
      ok: true,
      tab_id: 7,
      events: ["event:7"],
      scope: { tabId: 7 },
    });

    handler.handle({ kind: "CHAT_CLEAR" }, { url: "panel" }, clear);
    await flush();
    expect(calls).toEqual([
      "cancel:7",
      "schedule:clear",
      "events:clear",
      "persistence:clear",
    ]);
    expect(clear).toHaveBeenCalledWith({ ok: true });
  });
});
