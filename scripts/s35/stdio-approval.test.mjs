import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { Client, StdioClientTransport } from "../../dist/s35/fixtures.mjs";
function connect(f) {
  const client = new Client({ name: "s35-approval-sdk", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/s35/gateway.mjs"],
    env: { CONTEXTPILOT_MCP_PAIRING: f.configPath },
    stderr: "pipe",
  });
  return client.connect(transport).then(() => client);
}
const call = async (client, name, args) => {
  const response = await client.callTool({ name, arguments: args });
  assert.notEqual(response.isError, true, response.content[0].text);
  return JSON.parse(response.content[0].text);
};
test("S35 SDK stdio reconnect preserves pending approval and returns exactly one shared receipt", async () => {
  const f = await fixture();
  let client;
  try {
    client = await connect(f);
    const task = await call(client, "agent.open_external_task", {
      requestId: "stdio",
      profileId: "profile",
      tabId: 1,
      mode: "act",
      origin: "https://fixture.test",
      objective: "Fixture",
    });
    const input = await f.prepare(task.taskHandle, "stdio-step");
    const args = { taskHandle: task.taskHandle, callId: "stdio-step", input };
    assert.equal(
      (await call(client, "web__fill", args)).status,
      "pending_approval",
    );
    await client.close();
    client = null;
    assert.equal(f.counters.dispatches, 0);
    client = await connect(f);
    assert.equal(
      (await call(client, "agent.get_status", { taskHandle: task.taskHandle }))
        .pendingApprovalOrInput,
      true,
    );
    await f.runtimes.get("stdio-step").approve();
    const completed = await call(client, "web__fill", args);
    assert.equal(completed.receipt.verification, "passed");
    assert.deepEqual(await call(client, "web__fill", args), completed);
    assert.equal(f.counters.dispatches, 1);
    assert.equal(f.counters.approvals, 1);
    const cancelled = await call(client, "agent.cancel", {
      taskHandle: task.taskHandle,
    });
    assert.equal(cancelled.phase, "cancelled");
    assert.equal(cancelled.actionVerified, true);
    const status = await call(client, "agent.get_status", {
      taskHandle: task.taskHandle,
    });
    assert.equal(status.actionVerified, true);
    assert.equal(status.goal, "unknown");
    assert.equal(status.pendingApprovalOrInput, false);
  } finally {
    await client?.close();
    await f.close();
  }
});
