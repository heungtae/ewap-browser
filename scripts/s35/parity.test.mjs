import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixture.mjs";
const request = {
  requestId: "request",
  profileId: "profile",
  tabId: 1,
  mode: "act",
  origin: "https://fixture.test",
  objective: "Policy parity fixture",
};
const call = (f, name, args) =>
  f.backend.request(f.grant, { kind: "call", name, arguments: args });
test("S35 Ask-mode shared-runtime mutation denial and false completion/analyst commands", async () => {
  const f = await fixture();
  try {
    const task = await call(f, "agent.open_external_task", {
      ...request,
      mode: "ask",
    });
    const input = await f.prepare(task.taskHandle, "ask-step");
    const denied = await call(f, "web__fill", {
      taskHandle: task.taskHandle,
      callId: "ask-step",
      input,
    });
    assert.equal(denied.status, "failed");
    assert.equal(denied.error, "TOOL_UNAVAILABLE");
    for (const name of ["task__complete", "analysis__run"])
      await assert.rejects(
        call(f, name, {
          taskHandle: task.taskHandle,
          goalVerified: true,
          browserCommand: "web.click",
        }),
        /MCP_TOOL_DENIED/,
      );
    assert.equal(f.counters.dispatches, 0);
  } finally {
    await f.close();
  }
});
test("S35 prepared bindings changed after trusted approval fail through the shared runtime", async () => {
  const f = await fixture();
  try {
    const task = await call(f, "agent.open_external_task", request);
    const input = await f.prepare(task.taskHandle, "stale-step"),
      args = { taskHandle: task.taskHandle, callId: "stale-step", input };
    await call(f, "web__fill", args);
    await f.runtimes.get("stale-step").approve();
    f.runtimes.get("stale-step").f.context.documentEpoch++;
    const denied = await call(f, "web__fill", args);
    assert.equal(denied.status, "failed");
    assert.equal(denied.error, "PREPARED_STALE");
    assert.equal(f.counters.dispatches, 0);
  } finally {
    await f.close();
  }
});
