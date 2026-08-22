import { describe, expect, it } from "vitest";
import { BusinessMcpClient } from "../../../src/profile/business-mcp-client.js";

describe("business MCP client", () => {
  it("given_profile_bound_tool_when_calling_then_closed_result_is_returned", async () => {
    let request: Record<string, unknown> | undefined;
    const client = new BusinessMcpClient(async (_input, init) => {
      request = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          request_id: "request",
          kind: "CALL_PAGE_BUSINESS_TOOL_RESULT",
          status: "OK",
          tool_id: "field",
          result_key: "value",
          value_kind: "text",
          result: { value: "redacted" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    await expect(
      client.call(
        {
          server_id: "server",
          endpoint: "https://mcp.company.test",
          tool_id: "field",
          result_key: "value",
          value_kind: "text",
        },
        { kind: "CALL_PAGE_BUSINESS_TOOL", arguments: {} },
        {
          requestId: "request",
          runId: "run",
          nonce: "nonce",
          digest: "digest",
        },
      ),
    ).resolves.toMatchObject({ status: "OK" });
    expect(request).toMatchObject({
      kind: "CALL_PAGE_BUSINESS_TOOL",
      arguments: {},
      request_id: "request",
      run_id: "run",
      resolver_request_nonce: "nonce",
      page_context_digest: "digest",
    });
  });
  it("given_http_mcp_endpoint_when_calling_then_rejected", async () => {
    const client = new BusinessMcpClient();
    await expect(
      client.call(
        {
          server_id: "server",
          endpoint: "http://mcp.company.test",
          tool_id: "field",
          value_kind: "text",
        },
        {},
        {
          requestId: "request",
          runId: "run",
          nonce: "nonce",
          digest: "digest",
        },
      ),
    ).rejects.toThrow("BUSINESS_MCP_UNAVAILABLE");
  });
});
