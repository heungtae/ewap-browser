import { describe, expect, it } from "vitest";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";
import { createChatRunLifecycle } from "../../../src/service-worker/chat-run-lifecycle.js";
import type { BrowserPort } from "../../../src/service-worker/browser-api.js";

const scope = {
  document_epoch: "document-abcdefghijklmnop",
  page_scope_epoch: "scope-abcdefghijklmnop",
  origin: "https://fixture.company.test",
  path: "/reports",
};

describe("chat run lifecycle", () => {
  it("publishes progress immediately to the single unbound side panel", () => {
    const events = new TabChatSessionStore();
    events.bindRun("run-abcdefghijklmnop", 7, scope);
    const received: unknown[] = [];
    const port = {
      name: "contextpilot-panel",
      postMessage: (message: unknown) => received.push(message),
      onMessage: { addListener: () => undefined },
      onDisconnect: { addListener: () => undefined },
    } as BrowserPort;
    const lifecycle = createChatRunLifecycle({
      chrome: undefined,
      events,
      panels: new Map(),
      unboundPanels: new Set([port]),
      captures: new Map(),
      coordinator: {} as never,
      bindings: new Map(),
      localSessions: {} as never,
    });

    lifecycle.publish("run-abcdefghijklmnop", {
      type: "activity_progress",
      stage: "RESOLVING_PROFILE",
    });

    expect(received).toMatchObject([
      {
        kind: "CHAT_EVENT",
        event: { type: "activity_progress", stage: "RESOLVING_PROFILE" },
      },
    ]);
  });
  it("releases only the completed run's transient images", () => {
    const captures = new Map();
    const lifecycle = createChatRunLifecycle({
      chrome: undefined,
      events: new TabChatSessionStore(),
      panels: new Map(),
      unboundPanels: new Set(),
      captures,
      coordinator: {} as never,
      bindings: new Map(),
      localSessions: {} as never,
    });
    const image = {
      capture_id: "capture-abcdefghijklmnop",
      mime_type: "image/jpeg" as const,
      data_url: "data:image/jpeg;base64,aGVsbG8=",
    };
    lifecycle.rememberVision("run-one", image);
    lifecycle.rememberVision("run-two", image);
    lifecycle.releaseVision("run-one");
    expect([...captures.keys()]).toEqual(["run-two:capture-abcdefghijklmnop"]);
  });
});
