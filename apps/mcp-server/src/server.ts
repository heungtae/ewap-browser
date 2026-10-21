import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { safeCode, type BackendPort } from "@contextpilot/integration-adapters";
export function createMcpServer(backend: BackendPort) {
  const server = new Server(
    { name: "contextpilot-local", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () =>
    ListToolsResultSchema.parse(await backend.request({ kind: "catalog" })),
  );
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await backend.request({
        kind: "call",
        name: request.params.name,
        arguments: request.params.arguments ?? {},
      });
      const text = JSON.stringify(result);
      if (Buffer.byteLength(text) > 65536) throw new Error("MCP_OUTPUT_LIMIT");
      const failed =
        !!result &&
        typeof result === "object" &&
        "error" in result &&
        !!result.error;
      return { content: [{ type: "text" as const, text }], isError: failed };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: safeCode(error) }],
      };
    }
  });
  return server;
}
