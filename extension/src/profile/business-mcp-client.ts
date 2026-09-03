import { fail } from "../security/validation.js";
import { validateMcpResult } from "./mcp.js";
import type { BusinessMcpBinding } from "./mcp-binding.js";

export type { BusinessMcpBinding } from "./mcp-binding.js";

export class BusinessMcpClient {
  public constructor(private readonly fetcher: typeof fetch = fetch) {}
  public async call(
    binding: BusinessMcpBinding,
    request: Record<string, unknown>,
    expected: {
      requestId: string;
      runId: string;
      nonce: string;
      digest: string;
    },
  ): Promise<unknown> {
    let endpoint: URL;
    try {
      endpoint = new URL(binding.endpoint);
    } catch {
      return fail("BUSINESS_MCP_UNAVAILABLE");
    }
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      return fail("BUSINESS_MCP_UNAVAILABLE");
    const response = await this.fetcher(endpoint, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...request,
        request_id: expected.requestId,
        run_id: expected.runId,
        resolver_request_nonce: expected.nonce,
        page_context_digest: expected.digest,
      }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => fail("BUSINESS_MCP_UNAVAILABLE"));
    if (
      !response.ok ||
      response.headers.get("content-type") !== "application/json"
    )
      return fail("BUSINESS_MCP_PROTOCOL_ERROR");
    const result = await response
      .json()
      .catch(() => fail("BUSINESS_MCP_PROTOCOL_ERROR"));
    validateMcpResult(result, {
      kind: "CALL_PAGE_BUSINESS_TOOL_RESULT",
      requestId: expected.requestId,
      id: binding.tool_id,
      resultKey: binding.result_key,
      valueKind: binding.value_kind,
    });
    const text = (result as { result?: Record<string, unknown> }).result?.[
      binding.result_key
    ];
    if (typeof text !== "string" || text.length > binding.max_result_chars)
      return fail("BUSINESS_MCP_PROTOCOL_ERROR");
    return result;
  }
}
