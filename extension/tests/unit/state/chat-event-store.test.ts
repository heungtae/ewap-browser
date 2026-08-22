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

  it("accepts only redacted action-review views", () => {
    expect(
      validateChatEvent({
        type: "action_review_required",
        run_id: "run-abcdefghijklmnop",
        sequence: 1,
        action: {
          session_id: "session-abcdefghijklmnop",
          proposal_id: "proposal-abcdefghijklmnop",
          tool: "click_by_ref",
          target_name: "Submit report",
          origin: "https://fixture.company.test",
        },
      }),
    ).toMatchObject({
      type: "action_review_required",
      action: { target_name: "Submit report" },
    });
    expect(() =>
      validateChatEvent({
        type: "value_required",
        run_id: "run-abcdefghijklmnop",
        sequence: 1,
        value_kind: "text",
        action: {
          session_id: "session-abcdefghijklmnop",
          proposal_id: "proposal-abcdefghijklmnop",
          tool: "set_text_by_ref",
          target_name: "Name",
          suggested_value: "forbidden",
        },
      }),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("retains opaque confirmation data without accepting extra fields", () => {
    expect(
      validateChatEvent({
        type: "confirmation_required",
        run_id: "run-abcdefghijklmnop",
        sequence: 4,
        confirmation_id: "confirmation-abcdefghijklmnop",
        confirmation_nonce: "nonce-abcdefghijklmnop",
        action: {
          session_id: "session-abcdefghijklmnop",
          proposal_id: "proposal-abcdefghijklmnop",
          tool: "set_checked_by_ref",
          target_name: "Require confirmation",
        },
      }),
    ).toMatchObject({ type: "confirmation_required" });
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

  it("restores only closed monotonic event streams after worker recovery", () => {
    const source = new ChatEventStore();
    source.append("run-abcdefghijklmnop", {
      type: "run_started",
      mode: "ask",
      permission_mode: "standard",
    });
    source.append("run-abcdefghijklmnop", {
      type: "assistant_delta",
      text: "safe",
    });
    const restored = new ChatEventStore();
    restored.restore(source.recoverable());
    expect(restored.since("run-abcdefghijklmnop")).toHaveLength(2);
    restored.restore([
      {
        events: [
          {
            type: "assistant_delta",
            run_id: "run-abcdefghijklmnop",
            sequence: 2,
            text: "gap",
          },
        ],
      },
    ]);
    expect(restored.recoverable()).toEqual([]);
  });
});
