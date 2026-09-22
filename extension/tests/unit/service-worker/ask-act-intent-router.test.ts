import { describe, expect, it, vi } from "vitest";
import {
  createAskActIntentRouter,
  validateActIntentRoute,
} from "../../../src/service-worker/ask-act-intent-router.js";

describe("Ask/Act intent router", () => {
  it("accepts only a closed one-field route object", () => {
    expect(validateActIntentRoute('{"route":"ACTION_REQUIRED"}')).toBe(
      "ACTION_REQUIRED",
    );
    expect(validateActIntentRoute('{"route":"ACTION_REQUIRED","x":1}')).toBe(
      "QUESTION",
    );
    expect(validateActIntentRoute("save the page")).toBe("QUESTION");
  });

  it("withholds action route when the provider returns a tool call", async () => {
    const chat = vi.fn(async (_input: unknown) => ({
      content: '{"route":"ACTION_REQUIRED"}',
      tool_calls: [{ id: "call", name: "propose_click", arguments: "{}" }],
    }));
    const route = createAskActIntentRouter({ provider: { chat } as never });

    await expect(
      route("저장해", {
        tabId: 1,
        origin: "https://example.test",
        path: "/report",
        snapshot: { visible_text: "untrusted page text" },
      } as never),
    ).resolves.toBe("QUESTION");
    expect(chat.mock.calls[0]?.[0]).not.toHaveProperty("tools");
  });
});
