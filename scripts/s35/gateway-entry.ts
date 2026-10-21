import { startMcp } from "../../apps/mcp-server/src/entry.js";
const path = process.env.CONTEXTPILOT_MCP_PAIRING;
if (!path) {
  process.stderr.write("MCP_PAIRING_REQUIRED\n");
  process.exitCode = 1;
} else
  void startMcp(path).catch(() => {
    process.stderr.write("MCP_START_FAILED\n");
    process.exitCode = 1;
  });
