import { describe, expect, it, vi } from "vitest";
import {
  createAskActIntentRouter,
  validateActIntentRoute,
} from "../../../src/service-worker/ask-act-intent-router.js";

describe("Ask/Act intent router", () => {
  it("accepts only a closed one-field route object", () => {
    expect(validateActIntentRoute('{"route":"SOURCE_READ_REQUIRED"}')).toBe(
      "SOURCE_READ_REQUIRED",
    );
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
  it("returns a malformed classification for one closed-contract correction", async () => {
    const chat = vi
      .fn()
      .mockResolvedValueOnce({
        content:
          '{"route":"ACTION_REQUIRED","details":{"value":"private-input"}}',
        tool_calls: [],
      })
      .mockResolvedValueOnce({
        content: '{"route":"ACTION_REQUIRED"}',
        tool_calls: [],
      });
    const route = createAskActIntentRouter({ provider: { chat } as never });
    expect(
      await route("Enter a value", {
        tabId: 1,
        snapshot: { visible_text: "untrusted" },
      } as never),
    ).toBe("ACTION_REQUIRED");
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[1]?.[0]).not.toHaveProperty("tools");
    expect(chat.mock.calls[1]?.[0].messages.at(-1).content).toContain(
      "sole key route",
    );
  });
  it("stays read-only after repeated malformed classifier output", async () => {
    const chat = vi.fn(async () => ({
      content: '{"route":"ACTION_REQUIRED","details":{}}',
      tool_calls: [],
    }));
    expect(
      await createAskActIntentRouter({ provider: { chat } as never })(
        "Enter a value",
        { tabId: 1, snapshot: { visible_text: "untrusted" } } as never,
      ),
    ).toBe("QUESTION");
    expect(chat).toHaveBeenCalledTimes(2);
  });
  it("does not accept a correction arriving after Stop", async () => {
    const controller = new AbortController();
    let turns = 0;
    const chat = vi.fn(async () => {
      if (turns++ === 0) return { content: "invalid", tool_calls: [] };
      controller.abort();
      return { content: '{"route":"ACTION_REQUIRED"}', tool_calls: [] };
    });
    await expect(
      createAskActIntentRouter({ provider: { chat } as never })(
        "Enter",
        { tabId: 1, snapshot: { visible_text: "untrusted" } } as never,
        { tabId: 1, signal: controller.signal, check() {} },
      ),
    ).rejects.toThrow("POLICY_DENIED");
  });
});
