import { describe, expect, it } from "vitest";
import { validateMcpResult } from "../../../src/profile/mcp.js";

describe("Business MCP result", () => {
  it("given_closed_authoritative_result_when_validating_then_accepted", () =>
    expect(() =>
      validateMcpResult(
        {
          request_id: "request",
          kind: "GET_AUTHORITATIVE_FIELD_RESULT",
          status: "OK",
          field_id: "field",
          value_kind: "text",
          display_value: "redacted display",
        },
        {
          kind: "GET_AUTHORITATIVE_FIELD_RESULT",
          requestId: "request",
          id: "field",
          valueKind: "text",
        },
      ),
    ).not.toThrow());

  it("given_extra_result_field_when_validating_then_fails_closed", () =>
    expect(() =>
      validateMcpResult(
        {
          request_id: "request",
          kind: "GET_AUTHORITATIVE_FIELD_RESULT",
          status: "OK",
          field_id: "field",
          value_kind: "text",
          display_value: "redacted display",
          ref_id: "forbidden",
        },
        {
          kind: "GET_AUTHORITATIVE_FIELD_RESULT",
          requestId: "request",
          id: "field",
          valueKind: "text",
        },
      ),
    ).toThrow("BUSINESS_MCP_PROTOCOL_ERROR"));
});
