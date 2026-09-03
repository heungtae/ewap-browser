import { describe, expect, it } from "vitest";
import { businessMcpTool } from "../../../src/service-worker/business-mcp-tools.js";

describe("Business MCP model tool", () =>
  it("given_registry-expanded_tool_when_exposing_then_uses_closed_argument_schema", () => {
    const tool = businessMcpTool([
      {
        server_id: "manufacturing",
        endpoint: "https://mcp.company.test",
        tool_id: "get_yield",
        title: "Yield",
        description: "Read yield definition.",
        arguments: {
          type: "object",
          additionalProperties: false,
          properties: { metric: { type: "string", maxLength: 80 } },
          required: ["metric"],
        },
        result_key: "definition",
        value_kind: "text",
        max_result_chars: 4_000,
      },
    ]);
    expect(tool?.function.parameters).toMatchObject({
      additionalProperties: false,
      properties: {
        tool_id: { enum: ["get_yield"] },
        arguments: {
          oneOf: [
            {
              additionalProperties: false,
              required: ["metric"],
            },
          ],
        },
      },
    });
  }));
