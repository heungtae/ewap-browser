import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { Client, StdioClientTransport } from "../../dist/s35/fixtures.mjs";
const request = {
  requestId: "request",
  profileId: "profile",
  tabId: 1,
  mode: "act",
  origin: "https://fixture.test",
  objective: "Fixture",
};
test("S35 actual SDK stdio process negotiates tools and consumes task status/cancel continuation", async () => {
  const f = await fixture(),
    client = new Client({ name: "s35-sdk-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/s35/gateway.mjs"],
    env: { CONTEXTPILOT_MCP_PAIRING: f.configPath },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 5);
    const result = await client.callTool({
      name: "agent.execute_request",
      arguments: request,
    });
    const task = JSON.parse(result.content[0].text);
    const status = await client.callTool({
      name: "agent.get_status",
      arguments: { taskHandle: task.taskHandle },
    });
    assert.equal(JSON.parse(status.content[0].text).controller, "jev");
    const cancelled = await client.callTool({
      name: "agent.cancel",
      arguments: { taskHandle: task.taskHandle },
    });
    assert.equal(JSON.parse(cancelled.content[0].text).phase, "cancelled");
    const forged = await client.callTool({
      name: "task__complete",
      arguments: { verified: true },
    });
    assert.equal(forged.isError, true);
  } finally {
    await client.close();
    await f.close();
  }
});
