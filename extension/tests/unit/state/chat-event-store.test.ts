import { describe, expect, it } from "vitest";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";
import { validateChatEvent } from "../../../src/contracts/chat-events.js";

const scope = {
  document_epoch: "document-abcdefghijklmnop",
  page_scope_epoch: "scope-abcdefghijklmnop",
  origin: "https://fixture.company.test",
  path: "/reports",
};
const eventBase = {
  session_id: "session-abcdefghijklmnop",
  thread_id: "thread-abcdefghijklmnop",
  tab_id: 1,
  run_id: "run-abcdefghijklmnop",
  sequence: 1,
};

describe("tab chat session store", () => {
  it("keeps each tab's recoverable transcript and context isolated", () => {
    const store = new TabChatSessionStore();
    store.bindRun("run-tab-a-abcdefghijkl", 1, scope);
    store.append("run-tab-a-abcdefghijkl", {
      type: "user_message",
      text: "A only",
    });
    store.append("run-tab-a-abcdefghijkl", {
      type: "run_terminal",
      outcome: "VERIFIED",
    });
    store.bindRun("run-tab-b-abcdefghijkl", 2, { ...scope, path: "/other" });
    store.append("run-tab-b-abcdefghijkl", {
      type: "user_message",
      text: "B only",
    });
    expect(store.recoverable(1).map((event) => event.type)).toEqual([
      "user_message",
      "run_terminal",
    ]);
    expect(store.context(2)).toEqual([{ role: "user", content: "B only" }]);
  });

  it("attaches a closed session/thread/tab/run envelope", () => {
    const store = new TabChatSessionStore();
    store.bindRun("run-abcdefghijklmnop", 7, scope);
    expect(
      store.append("run-abcdefghijklmnop", {
        type: "run_started",
        mode: "ask",
        permission_mode: "standard",
      }),
    ).toMatchObject({ tab_id: 7, run_id: "run-abcdefghijklmnop", sequence: 1 });
  });

  it("resyncs the tab-thread timeline when a second run starts after it", () => {
    const store = new TabChatSessionStore();
    store.bindRun("run-first-abcdefghijkl", 1, scope);
    store.append("run-first-abcdefghijkl", {
      type: "user_message",
      text: "first question",
    });
    store.append("run-first-abcdefghijkl", {
      type: "run_terminal",
      outcome: "VERIFIED",
    });
    store.bindRun("run-second-abcdefghijk", 1, scope);
    store.append("run-second-abcdefghijk", {
      type: "user_message",
      text: "second question",
    });

    expect(store.sinceThreadForRun("run-second-abcdefghijk", 2)).toMatchObject([
      {
        run_id: "run-second-abcdefghijk",
        sequence: 3,
        type: "user_message",
      },
    ]);
  });

  it("does not persist capability events and redacts transcript secrets", () => {
    const store = new TabChatSessionStore();
    store.bindRun("run-abcdefghijklmnop", 1, scope);
    store.append("run-abcdefghijklmnop", {
      type: "user_message",
      text: "password=not-for-egress and sk-abcdefghijklmnop",
    });
    store.append("run-abcdefghijklmnop", {
      type: "action_review_required",
      action: {
        session_id: "session-abcdefghijklmnop",
        proposal_id: "proposal-abcdefghijklmnop",
        tool: "click_by_ref",
        target_name: "Submit",
      },
    });
    expect(store.recoverable(1).map((event) => event.type)).toEqual([
      "user_message",
      "action_review_required",
    ]);
    const snapshot = JSON.stringify(store.snapshot());
    expect(snapshot).toContain("[REDACTED]");
    expect(snapshot).not.toContain("not-for-egress");
    expect(snapshot).not.toContain("action_review_required");
  });

  it("removes live action reviews from recovery once their run terminates", () => {
    const store = new TabChatSessionStore();
    store.bindRun("run-abcdefghijklmnop", 1, scope);
    store.append("run-abcdefghijklmnop", {
      type: "action_review_required",
      action: {
        session_id: "session-abcdefghijklmnop",
        proposal_id: "proposal-abcdefghijklmnop",
        tool: "click_by_ref",
        target_name: "Open analysis",
      },
    });
    store.append("run-abcdefghijklmnop", {
      type: "run_terminal",
      outcome: "CANCELLED",
    });

    expect(store.recoverable(1).map((event) => event.type)).toEqual([
      "run_terminal",
    ]);
  });

  it("preserves safe Markdown line boundaries in persisted assistant text", () => {
    const store = new TabChatSessionStore();
    store.bindRun("run-abcdefghijklmnop", 1, scope);
    store.append("run-abcdefghijklmnop", {
      type: "assistant_delta",
      text: "**요약**\n\n- 첫 번째 항목\n- 두 번째 항목",
    });
    expect(store.recoverable(1)[0]).toMatchObject({
      text: "**요약**\n\n- 첫 번째 항목\n- 두 번째 항목",
    });
  });

  it("adds a visible page boundary and does not reuse the prior scope", () => {
    const store = new TabChatSessionStore();
    store.bindRun("run-abcdefghijklmnop", 1, scope);
    store.append("run-abcdefghijklmnop", {
      type: "run_terminal",
      outcome: "VERIFIED",
    });
    store.ensureThread(1, {
      ...scope,
      page_scope_epoch: "scope-new-abcdefghijkl",
    });
    expect(store.recoverable(1).at(-1)?.type).toBe("page_scope_changed");
  });

  it("rejects provider-shaped fields and requires the routing envelope", () => {
    expect(() =>
      validateChatEvent({
        ...eventBase,
        type: "assistant_delta",
        text: "safe",
        raw_provider_response: "secret",
      }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      validateChatEvent({
        type: "assistant_delta",
        run_id: eventBase.run_id,
        sequence: 1,
        text: "safe",
      }),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("restores persistent timeline only and discards live capabilities", () => {
    const source = new TabChatSessionStore();
    source.bindRun("run-abcdefghijklmnop", 1, scope);
    source.append("run-abcdefghijklmnop", {
      type: "assistant_delta",
      text: "safe",
    });
    const restored = new TabChatSessionStore();
    restored.restore(source.snapshot());
    expect(restored.recoverable(1)).toMatchObject([
      { type: "assistant_delta", text: "safe" },
    ]);
  });
});
