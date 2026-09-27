import { fail } from "../security/validation.js";
import { validateMcpResult } from "./mcp.js";
import type { BusinessMcpBinding } from "./mcp-binding.js";

export type { BusinessMcpBinding } from "./mcp-binding.js";

const maxResponseBytes = 24 * 1_024;

const boundedJson = async (response: Response): Promise<unknown> => {
  if (!response.body) return fail("BUSINESS_MCP_PROTOCOL_ERROR");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return fail("BUSINESS_MCP_PROTOCOL_ERROR");
      }
      chunks.push(part.value);
    }
  } catch {
    return fail("BUSINESS_MCP_PROTOCOL_ERROR");
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return fail("BUSINESS_MCP_PROTOCOL_ERROR");
  }
};

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
      credentials: "omit",
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
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxResponseBytes)
      return fail("BUSINESS_MCP_PROTOCOL_ERROR");
    const result = await boundedJson(response);
    validateMcpResult(result, {
      kind: "CALL_PAGE_BUSINESS_TOOL_RESULT",
      requestId: expected.requestId,
      id: binding.tool_id,
      resultKey: binding.result_key,
      valueKind: binding.value_kind,
    });
    if ((result as { status?: unknown }).status !== "OK")
      return fail("BUSINESS_MCP_PROTOCOL_ERROR");
    const text = (result as { result?: Record<string, unknown> }).result?.[
      binding.result_key
    ];
    if (typeof text !== "string" || text.length > binding.max_result_chars)
      return fail("BUSINESS_MCP_PROTOCOL_ERROR");
    return result;
  }
}
