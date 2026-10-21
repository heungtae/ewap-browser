import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
import { ExternalTools, McpStepStore } from "../../dist/s35/fixtures.mjs";
const request = {
  requestId: "request",
  profileId: "profile",
  tabId: 1,
  mode: "act",
  origin: "https://fixture.test",
  objective: "Controlled external fixture",
};
const call = (f, name, args) =>
  f.backend.request(f.grant, { kind: "call", name, arguments: args });
test("S35 reconstructed pending adapter returns UNKNOWN and cannot auto-prepare/dispatch", async () => {
  const f = await fixture();
  try {
    const task = await call(f, "agent.open_external_task", request);
    const input = await f.prepare(task.taskHandle, "pending");
    const args = { taskHandle: task.taskHandle, callId: "pending", input };
    assert.equal((await call(f, "web__fill", args)).status, "pending_approval");
    let resolved = false;
    const restarted = new ExternalTools(
      f.api,
      new McpStepStore(f.db),
      async () => {
        resolved = true;
        throw Error("FORBIDDEN");
      },
      () => f.grant,
    );
    assert.equal(
      (await restarted.call(f.grant, "web.fill", args)).status,
      "unknown",
    );
    assert.equal(resolved, false);
    await assert.rejects(
      restarted.call(f.grant, "web.fill", { ...args, callId: "alternative" }),
      /MCP_TASK_RECONCILIATION_REQUIRED/,
    );
    assert.equal(f.counters.dispatches, 0);
  } finally {
    await f.close();
  }
});
test("S35 ambiguous dispatched receipt blocks both duplicate mutation and new-call retries", async () => {
  const f = await fixture();
  try {
    const task = await call(f, "agent.open_external_task", request);
    const input = await f.prepare(task.taskHandle, "ambiguous");
    f.runtimes.get("ambiguous").f.state.partial = true;
    const args = { taskHandle: task.taskHandle, callId: "ambiguous", input };
    await call(f, "web__fill", args);
    await f.runtimes.get("ambiguous").approve();
    const unknown = await call(f, "web__fill", args);
    assert.equal(unknown.receipt.dispatch, "unknown");
    assert.equal(unknown.receipt.commands, 1);
    assert.equal(f.counters.dispatches, 1);
    assert.deepEqual(await call(f, "web__fill", args), unknown);
    await assert.rejects(
      call(f, "web__fill", { ...args, callId: "retry" }),
      /MCP_TASK_RECONCILIATION_REQUIRED/,
    );
    const status = await call(f, "agent.get_status", {
      taskHandle: task.taskHandle,
    });
    assert.equal(status.dispatchUnknown, true);
    assert.equal(status.goal, "unknown");
    assert.equal(f.counters.dispatches, 1);
  } finally {
    await f.close();
  }
});
