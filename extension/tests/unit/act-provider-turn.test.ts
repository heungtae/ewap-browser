import { describe, expect, it } from "vitest";
import { completeActProviderTurn } from "../../src/service-worker/act-provider-turn.js";
import { parseChatResponse } from "../../src/providers/provider-response.js";
import { parseSseProviderBody } from "../../src/providers/sse-response.js";
import type { ProviderMessage } from "../../src/providers/types.js";

describe("Act provider completion boundary", () => {
  it("preserves Responses API output-limit termination", () => {
    expect(
      parseChatResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [],
      }).finish_reason,
    ).toBe("length");
    expect(
      parseChatResponse(
        parseSseProviderBody(
          'data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}\n',
        ),
      ).finish_reason,
    ).toBe("length");
  });
  it("returns every batched proposal ID before requesting a reviewed plan", async () => {
    const messages: ProviderMessage[] = [];
    let count = 0;
    await completeActProviderTurn(messages, async () =>
      ++count === 1
        ? {
            content: "",
            tool_calls: ["one", "two"].map((id) => ({
              id,
              name: "propose_set_text",
              arguments: "{}",
            })),
          }
        : {
            content: "",
            tool_calls: [{ id: "plan", name: "submit_plan", arguments: "{}" }],
          },
    );
    expect(
      messages
        .filter((message) => message.role === "tool")
        .map((message) => message.tool_call_id),
    ).toEqual(["one", "two"]);
    expect(messages.at(-1)?.content).toContain("first submit_plan");
  });
  it("preserves stream truncation even with no generated content", () => {
    const response = parseChatResponse(
      parseSseProviderBody(
        'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n',
      ),
    );
    expect(response.finish_reason).toBe("length");
  });
  it("returns the actual call ID and retries without repairing arguments", async () => {
    const messages: ProviderMessage[] = [];
    let count = 0;
    const response = await completeActProviderTurn(messages, async () =>
      ++count === 1
        ? {
            content: "",
            tool_calls: [
              {
                id: "original-call",
                name: "propose_set_text",
                arguments: '{"value":',
              },
            ],
            finish_reason: "length",
          }
        : {
            content: "",
            tool_calls: [
              {
                id: "replacement-call",
                name: "propose_set_text",
                arguments: '{"value":"exact"}',
              },
            ],
          },
    );
    expect(count).toBe(2);
    expect(messages[1]!.tool_call_id).toBe("original-call");
    expect(messages[0]!.tool_calls?.[0]?.arguments).toBe('{"value":');
    expect(response.tool_calls[0]!.id).toBe("replacement-call");
  });
  it("rejects a second truncated response even when JSON is valid", async () => {
    let count = 0;
    await expect(
      completeActProviderTurn([], async () => {
        count++;
        return { content: "", tool_calls: [], finish_reason: "length" };
      }),
    ).rejects.toThrow("INVALID_ARGUMENT");
    expect(count).toBe(2);
  });
  it("propagates cancellation without another retry", async () => {
    await expect(
      completeActProviderTurn([], async () => {
        throw new DOMException("Stopped", "AbortError");
      }),
    ).rejects.toThrow("Stopped");
  });
});
