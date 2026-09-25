import { describe, expect, it } from "vitest";
import { parseChatResponse } from "../../../src/providers/provider-response.js";
import { parseSseProviderBody } from "../../../src/providers/sse-response.js";

describe("provider response browser authority", () => {
  it.each([
    "cdp_method",
    "selector",
    "coordinates",
    "execution_path",
    "backend_node_id",
  ])("rejects structured %s field", (field) => {
    expect(() =>
      parseChatResponse({
        choices: [
          { message: { content: "safe answer", metadata: { [field]: "x" } } },
        ],
      }),
    ).toThrow("PROVIDER_PLUGIN_FAILED");
  });

  it("does not treat plain answer text as browser authority", () => {
    expect(
      parseChatResponse({
        choices: [{ message: { content: "The word selector is text." } }],
      }),
    ).toEqual({ content: "The word selector is text.", tool_calls: [] });
  });

  it("rejects browser authority fields in streamed events", () => {
    expect(() =>
      parseSseProviderBody(
        'data: {"choices":[{"delta":{"content":"ok"}}],"cdp_method":"Input.dispatchMouseEvent"}\n\n',
      ),
    ).toThrow("PROVIDER_PLUGIN_FAILED");
  });
});
