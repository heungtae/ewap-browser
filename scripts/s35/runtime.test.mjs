import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture } from "./fixture.mjs";
import {
  BackendConnection,
  Client,
  StdioClientTransport,
} from "../../dist/s35/fixtures.mjs";
const request = {
  requestId: "request",
  profileId: "profile",
  tabId: 1,
  mode: "act",
  origin: "https://fixture.test",
  objective: "Controlled fixture request",
};
const call = (backend, grant, name, args) =>
  backend.request(grant, { kind: "call", name, arguments: args });
test("S35 pairing/scope denial, durable reconnect, idempotent admission and cancel", async () => {
  const f = await fixture();
  let a, b;
  try {
    const config = JSON.parse(await readFile(f.configPath, "utf8"));
    await assert.rejects(
      BackendConnection.open({ ...config, secret: "wrong".repeat(8) }),
      /MCP_BACKEND_DISCONNECTED/,
    );
    a = await BackendConnection.open(config);
    const accepted = await a.request({
      kind: "call",
      name: "agent.execute_request",
      arguments: request,
    });
    assert.equal(accepted.controller, "jev");
    a.close();
    a = null;
    b = await BackendConnection.open(config);
    const repeated = await b.request({
      kind: "call",
      name: "agent.execute_request",
      arguments: request,
    });
    assert.equal(repeated.taskHandle, accepted.taskHandle);
    assert.equal(
      f.db.prepare("SELECT count(*) AS n FROM mcp_outbox").get().n,
      1,
    );
    await assert.rejects(
      call(f.backend, { ...f.grant, clientId: "other" }, "agent.get_status", {
        taskHandle: accepted.taskHandle,
      }),
      /MCP_TASK_UNAVAILABLE/,
    );
    for (const changed of [
      { profileId: "foreign" },
      { tabId: 2 },
      { origin: "https://foreign.test" },
    ])
      await assert.rejects(
        call(f.backend, f.grant, "agent.execute_request", {
          ...request,
          ...changed,
        }),
        /MCP_SCOPE_DENIED/,
      );
    const cancelled = await b.request({
      kind: "call",
      name: "agent.cancel",
      arguments: { taskHandle: accepted.taskHandle },
    });
    assert.equal(cancelled.phase, "cancelled");
    assert.equal(f.counters.dispatches, 0);
  } finally {
    a?.close();
    b?.close();
    await f.close();
  }
});
test("S35 shared prepare/approval/receipt pipeline, duplicate receipt and forged approval rejection", async () => {
  const f = await fixture();
  try {
    const task = await call(
      f.backend,
      f.grant,
      "agent.open_external_task",
      request,
    );
    const input = await f.prepare(task.taskHandle, "step-one");
    const args = { taskHandle: task.taskHandle, callId: "step-one", input };
    await assert.rejects(
      call(f.backend, f.grant, "web__fill", { ...args, approvalId: "forged" }),
    );
    const pending = await call(f.backend, f.grant, "web__fill", args);
    assert.equal(pending.status, "pending_approval");
    assert.equal(f.counters.dispatches, 0);
    assert.equal(
      (
        await call(f.backend, f.grant, "agent.get_status", {
          taskHandle: task.taskHandle,
        })
      ).pendingApprovalOrInput,
      true,
    );
    await f.runtimes.get("step-one").approve();
    const completed = await call(f.backend, f.grant, "web__fill", args);
    assert.equal(completed.receipt.verification, "passed");
    assert.equal(completed.receipt.goalVerified, false);
    assert.equal(f.counters.dispatches, 1);
    assert.deepEqual(
      await call(f.backend, f.grant, "web__fill", args),
      completed,
    );
    await assert.rejects(
      call(f.backend, f.grant, "web__fill", {
        ...args,
        input: { ...input, extra: "changed" },
      }),
      /MCP_CALL_CONFLICT/,
    );
    assert.deepEqual(
      await call(f.backend, f.grant, "web__fill", args),
      completed,
    );
    assert.equal(f.counters.dispatches, 1);
  } finally {
    await f.close();
  }
});
test("S35 revoked scope/Stop do not dispatch", async () => {
  const f = await fixture();
  try {
    const task = await call(
      f.backend,
      f.grant,
      "agent.open_external_task",
      request,
    );
    const input = await f.prepare(task.taskHandle, "pending");
    const args = { taskHandle: task.taskHandle, callId: "pending", input };
    assert.equal(
      (await call(f.backend, f.grant, "web__fill", args)).status,
      "pending_approval",
    );
    await f.runtimes.get("pending").approve();
    f.pairings.get(f.grant.clientId).grant = { ...f.grant, revision: 2 };
    const revoked = await call(f.backend, f.grant, "web__fill", args);
    assert.equal(revoked.error, "MCP_SCOPE_REVOKED");
    assert.equal(f.counters.dispatches, 0);
    await call(f.backend, f.grant, "agent.cancel", {
      taskHandle: task.taskHandle,
    });
    await assert.rejects(
      call(f.backend, f.grant, "web__fill", { ...args, callId: "new" }),
      /MCP_TASK_TERMINAL/,
    );
    assert.equal(f.counters.dispatches, 0);
  } finally {
    await f.close();
  }
});
