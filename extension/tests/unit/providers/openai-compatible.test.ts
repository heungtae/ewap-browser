import { describe, expect, it } from "vitest";
import { openAiCompatibleAdapter } from "../../../src/providers/openai-compatible.js";

describe("OpenAI-compatible adapter", () => {
  it("given_responses_tool_loop_when_planning_then_uses_responses_function_contract", () => {
    const plan = openAiCompatibleAdapter.plan({
      wire_api: "responses",
      model: "gpt-5.6-luna",
      messages: [
        { role: "system", content: "Ground answers in the page." },
        { role: "user", content: "Summarize." },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_1",
              name: "read_semantic_projection",
              arguments: "{}",
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_1",
          content: '{"title":"ContextPilot"}',
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "read_semantic_projection",
            description: "Read the page.",
            parameters: { type: "object", additionalProperties: false },
          },
        },
      ],
      stream: false,
    });

    expect(plan).toEqual({
      path: "/responses",
      body: {
        model: "gpt-5.6-luna",
        input: [
          { role: "system", content: "Ground answers in the page." },
          { role: "user", content: "Summarize." },
          {
            type: "function_call",
            call_id: "call_1",
            name: "read_semantic_projection",
            arguments: "{}",
          },
          {
            type: "function_call_output",
            call_id: "call_1",
            output: '{"title":"ContextPilot"}',
          },
        ],
        tools: [
          {
            type: "function",
            name: "read_semantic_projection",
            description: "Read the page.",
            parameters: { type: "object", additionalProperties: false },
          },
        ],
        stream: false,
      },
    });
  });
});
