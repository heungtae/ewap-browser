import { describe, expect, it } from "vitest";
import { validateChatEvent } from "../../../src/contracts/chat-events.js";
import { shouldRenderChatEvent } from "../../../src/sidepanel/chat-event-gate.js";

const base = {
  session_id: "session-abcdefghijklmnop",
  thread_id: "thread-abcdefghijklmnop",
  tab_id: 7,
  run_id: "run-abcdefghijklmnop",
  sequence: 1,
};

describe("S5 chat event boundaries", () => {
  it("rejects fields from a different event variant", () => {
    expect(() => validateChatEvent({ ...base, type: "toString" })).toThrow(
      "INVALID_ARGUMENT",
    );
    expect(() =>
      validateChatEvent({
        ...base,
        type: "assistant_delta",
        text: "safe",
        tool: "click_by_ref",
      }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      validateChatEvent({
        ...base,
        type: "run_terminal",
        outcome: "VERIFIED",
        text: "late",
      }),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("rejects stale tabs and all events following a terminal", () => {
    const delta = validateChatEvent({
      ...base,
      type: "assistant_delta",
      text: "answer",
    });
    expect(shouldRenderChatEvent(delta, 8, new Set(), new Set())).toBe(false);
    expect(
      shouldRenderChatEvent(delta, 7, new Set([base.run_id]), new Set()),
    ).toBe(false);
    expect(
      shouldRenderChatEvent(delta, 7, new Set(), new Set(), "other-run"),
    ).toBe(false);
  });

  it("blocks late deltas after Stop but permits the terminal outcome", () => {
    const stopped = new Set([base.run_id]);
    const delta = validateChatEvent({
      ...base,
      type: "assistant_delta",
      text: "late",
    });
    const terminal = validateChatEvent({
      ...base,
      sequence: 2,
      type: "run_terminal",
      outcome: "CANCELLED",
    });
    expect(shouldRenderChatEvent(delta, 7, new Set(), stopped)).toBe(false);
    expect(shouldRenderChatEvent(terminal, 7, new Set(), stopped)).toBe(true);
  });
});
