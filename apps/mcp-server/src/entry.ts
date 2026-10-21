import { Transform } from "node:stream";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readPrivateJson } from "@contextpilot/integration-adapters";
import { BackendConnection } from "./connection.js";
import { createMcpServer } from "./server.js";
export async function startMcp(pairingPath: string): Promise<void> {
  const backend = await BackendConnection.open(
    await readPrivateJson(pairingPath),
  );
  let bytes = 0;
  const bounded = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      for (const byte of chunk) {
        bytes = byte === 10 ? 0 : bytes + 1;
        if (bytes > 262144) {
          callback(new Error("MCP_INPUT_LIMIT"));
          return;
        }
      }
      callback(null, chunk);
    },
  });
  const server = createMcpServer(backend);
  bounded.on("error", () => {
    void server.close().catch(() => undefined);
    process.stdin.destroy();
    backend.close();
    process.stderr.write("MCP_INPUT_LIMIT\n");
    process.exitCode = 1;
  });
  await server.connect(
    new StdioServerTransport(process.stdin.pipe(bounded), process.stdout),
  );
  server.onclose = () => backend.close();
  process.stdin.once("end", () => {
    void server.close();
    backend.close();
  });
}
