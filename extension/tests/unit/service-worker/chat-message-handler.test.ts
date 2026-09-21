import { describe, expect, it, vi } from "vitest";
import { createChatMessageHandler } from "../../../src/service-worker/chat-message-handler.js";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";
import type { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";
import type { ChatEvent } from "../../../src/contracts/chat-events.js";
import type { PageScope } from "../../../src/state/tab-chat-session-store.js";
import type { ChatSessionSnapshot } from "../../../src/state/tab-chat-session-store.js";

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const createMockChatEvents = (
  calls: string[],
): Pick<
  TabChatSessionStore,
  | "clear"
  | "recoverable"
  | "scope"
  | "sinceThreadForRun"
  | "snapshot"
  | "has"
  | "terminal"
> => {
  const eventsMap = new Map<number, ChatEvent[]>();
  return {
    clear: () => {
      calls.push("events:clear");
      eventsMap.clear();
    },
    recoverable: (_tabId: number) => eventsMap.get(_tabId) ?? [],
    scope: (_tabId: number): PageScope | undefined => ({
      document_epoch: "epoch",
      page_scope_epoch: "scope",
      origin: "https://example.com",
      path: "/",
    }),
    sinceThreadForRun: (_runId: string, _sequence: number) => [],
    snapshot: (): ChatSessionSnapshot => ({
      schema_version: 1,
      session_id: "test-session",
      threads: [],
    }),
    has: (_runId: string) => false,
    terminal: (_runId: string) => false,
  };
};

const createHandler = () => {
  const calls: string[] = [];
  const mockChatEvents = createMockChatEvents(calls);
  const handler = createChatMessageHandler({
    activeTabForBoundPanel: async () => ({ id: 7 }),
    activeTabForPanel: async () => ({
      id: 7,
      title: "Google 검색 결과",
      url: "https://www.google.com/search?q=contextpilot#top",
    }),
    cancelActiveTab: (tabId) => calls.push(`cancel:${tabId}`),
    chatEvents: mockChatEvents as unknown as TabChatSessionStore,
    chatPersistence: {
      clear: async () => {
        calls.push("persistence:clear");
      },
    },
    clearScheduledChatPersistence: () => calls.push("schedule:clear"),
    isPanelSender: (sender) => sender.url === "panel",
    providerAvailable: () => true,
    requests: new ChatRequestLifecycle(),
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
    await vi.waitFor(() => expect(respond).toHaveBeenCalled());
    expect(calls).toEqual(["act"]);
    expect(respond).toHaveBeenCalledWith({ ok: true });
  });

  it("accepts a request immediately and exposes its terminal status", async () => {
    const { calls, handler } = createHandler();
    const start = vi.fn();
    const status = vi.fn();
    const id = "c2f597ec-1096-4e99-8e2e-2c43b05c0dfb";

    expect(
      handler.handle(
        {
          schema_version: 1,
          kind: "CHAT_REQUEST_START",
          request_id: id,
          payload: { mode: "ask", prompt: "run" },
        },
        { url: "panel" },
        start,
      ),
    ).toEqual({ handled: true, keepAlive: true });
    await flush();
    await vi.waitFor(() => expect(start).toHaveBeenCalled());
    expect(start).toHaveBeenCalledWith({
      ok: true,
      accepted: true,
      request_id: id,
      revision: 1,
    });
    expect(calls).toEqual(["ask"]);

    handler.handle(
      { schema_version: 1, kind: "CHAT_REQUEST_STATUS", request_id: id },
      { url: "panel" },
      status,
    );
    await flush();
    expect(status).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        request: expect.objectContaining({
          state: "TERMINAL",
          outcome: "VERIFIED",
        }),
      }),
    );
  });

  it("keeps the same bound panel request readable after the page epoch changes", async () => {
    const calls: string[] = [];
    const requests = new ChatRequestLifecycle();
    let pageEpoch = "before-navigation";
    const handler = createChatMessageHandler({
      activeTabForBoundPanel: async () => ({ id: 7, epoch: pageEpoch }),
      activeTabForPanel: async () => ({ id: 7 }),
      cancelActiveTab: () => undefined,
      chatEvents: createMockChatEvents(calls) as unknown as TabChatSessionStore,
      chatPersistence: { clear: async () => undefined },
      clearScheduledChatPersistence: () => undefined,
      isPanelSender: (sender) => sender.url === "panel",
      providerAvailable: () => true,
      requests,
      runActChat: async () => ({ ok: true }),
      runAskChat: async () => ({ ok: true }),
      safeFailure: (code) => ({ ok: false, code }),
    });
    const sender = { url: "panel", documentId: "panel-document" };
    const id = "c2f597ec-1096-4e99-8e2e-2c43b05c0dfb";
    const start = vi.fn();
    const status = vi.fn();

    handler.handle(
      {
        schema_version: 1,
        kind: "CHAT_REQUEST_START",
        request_id: id,
        payload: { mode: "ask", prompt: "run" },
      },
      sender,
      start,
    );
    await vi.waitFor(() => expect(start).toHaveBeenCalled());

    pageEpoch = "after-navigation";
    handler.handle(
      { schema_version: 1, kind: "CHAT_REQUEST_STATUS", request_id: id },
      sender,
      status,
    );
    await vi.waitFor(() => expect(status).toHaveBeenCalled());
    expect(status).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, request: expect.any(Object) }),
    );
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
      events: [],
      scope: {
        document_epoch: "epoch",
        page_scope_epoch: "scope",
        origin: "https://example.com",
        path: "/",
      },
      page: { title: "Google 검색 결과", origin: "https://www.google.com" },
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
