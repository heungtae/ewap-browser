import { describe, expect, it } from "vitest";
import { ChatEventStore } from "../../../src/state/chat-event-store.js";
import { validateChatEvent } from "../../../src/contracts/chat-events.js";

describe("chat event store", () => {
  it("assigns monotonic sequences and resyncs only missing events", () => {
    const store = new ChatEventStore();
    const first = store.append("run-abcdefghijklmnop", {
      type: "run_started",
      mode: "ask",
      permission_mode: "standard",
    });
    store.append("run-abcdefghijklmnop", {
      type: "assistant_delta",
      text: "one",
    });
    store.append("run-abcdefghijklmnop", {
      type: "assistant_delta",
      text: "two",
    });
    expect(first.sequence).toBe(1);
    expect(
      store.since("run-abcdefghijklmnop", 1).map((event) => event.sequence),
    ).toEqual([2, 3]);
  });

  it("rejects UI events with provider-shaped or secret fields", () => {
    expect(() =>
      validateChatEvent({
        type: "assistant_delta",
        run_id: "run-abcdefghijklmnop",
        sequence: 1,
        text: "safe",
        raw_provider_response: "secret",
      }),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("prevents any post-terminal transcript mutation", () => {
    const store = new ChatEventStore();
    store.append("run-abcdefghijklmnop", {
      type: "run_terminal",
      outcome: "CANCELLED",
    });
    expect(() =>
      store.append("run-abcdefghijklmnop", {
        type: "assistant_delta",
        text: "late",
      }),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("reports whether a tracked stream reached a terminal event", () => {
    const store = new ChatEventStore();
    store.append("run-abcdefghijklmnop", {
      type: "run_started",
      mode: "ask",
      permission_mode: "standard",
    });
    expect(store.terminal("run-abcdefghijklmnop")).toBe(false);
    store.append("run-abcdefghijklmnop", {
      type: "run_terminal",
      outcome: "CANCELLED",
    });
    expect(store.terminal("run-abcdefghijklmnop")).toBe(true);
  });
});
