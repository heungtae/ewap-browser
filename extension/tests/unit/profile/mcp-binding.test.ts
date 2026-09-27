import { describe, expect, it } from "vitest";
import {
  businessMcpArguments,
  businessMcpBindings,
} from "../../../src/profile/mcp-binding.js";

const source = [
  {
    server_id: "manufacturing-data",
    endpoint: "https://business-mcp.company.test/page-tools",
    tool_id: "get_yield_definition",
    title: "Yield definition",
    description: "Return the current page metric definition.",
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
];

describe("Business MCP registry binding", () => {
  it("given_closed_registry_binding_when_reading_then_returns_it", () => {
    const [binding] = businessMcpBindings(source);
    expect(binding?.tool_id).toBe("get_yield_definition");
    expect(businessMcpArguments(binding!, { metric: "yield" })).toEqual({
      metric: "yield",
    });
  });
  it("given_extra_or_unbounded_contract_when_reading_then_fails_closed", () => {
    expect(() => businessMcpBindings([{ ...source[0], unsafe: true }])).toThrow(
      "PROFILE_UNAVAILABLE",
    );
    const [binding] = businessMcpBindings(source);
    expect(() => businessMcpArguments(binding!, { other: "value" })).toThrow(
      "INVALID_ARGUMENT",
    );
  });
  it("rejects unsafe endpoints before a Profile can be accepted", () => {
    for (const endpoint of [
      "http://business-mcp.company.test/page-tools",
      "https://user:secret@business-mcp.company.test/page-tools",
      "https://business-mcp.company.test/page-tools?token=secret",
      "https://business-mcp.company.test/page-tools#fragment",
      "not-a-url",
    ])
      expect(() => businessMcpBindings([{ ...source[0], endpoint }])).toThrow(
        "PROFILE_UNAVAILABLE",
      );
  });
  it("requires declared own properties in argument schemas and calls", () => {
    expect(() =>
      businessMcpBindings([
        {
          ...source[0],
          arguments: {
            ...source[0]!.arguments,
            required: ["undeclared"],
          },
        },
      ]),
    ).toThrow("PROFILE_UNAVAILABLE");
    const [binding] = businessMcpBindings(source);
    expect(() =>
      businessMcpArguments(binding!, { toString: "bypass" }),
    ).toThrow("INVALID_ARGUMENT");
  });
});
