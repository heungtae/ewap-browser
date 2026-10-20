import { expect, it } from "vitest";
import type { RuntimePorts } from "../../../../../packages/tool-runtime/src/index.js";
async function fixture() {
  const { IDBFactory } = await import("fake-indexeddb");
  return runtimeFixture(new IDBFactory());
}
import { runtimeFixture } from "../../../fixture/s30/runtime-fixture.js";
import {
  BrowserRevocations,
  IndexedDbDispatchJournal,
} from "../../../../../packages/browser-runtime/src/index.js";
import { ReceiptSyncJournal } from "../../../../../apps/chrome-extension/src/runtime/durable-dispatch.js";
it("S31 offline Stop blocks synchronously and remains pending across restart/ACK", async () => {
  const f = await fixture();
  const revocation = new BrowserRevocations(f.db, f.context.partitionId);
  expect(() => revocation.assert(f.context)).toThrow("RECOVERY_REQUIRED");
  await revocation.restore();
  const ports: RuntimePorts = f.ports;
  ports.browser = revocation.guard(f.ports.browser);
  const p = await f.runtime.prepare("web.fill", f.intent);
  const a = await f.runtime.requestApproval(p.step.id);
  if (a.kind !== "approved") throw new Error();
  const stopped = revocation.stop(f.context.taskId);
  expect(() => revocation.assert(f.context)).toThrow("TASK_REVOKED");
  await stopped;
  await expect(f.runtime.execute(p.step.id, a.receipt.id)).rejects.toThrow(
    "TASK_REVOKED",
  );
  const restart = new BrowserRevocations(f.db, f.context.partitionId);
  await restart.restore();
  expect(await restart.pending()).toEqual([f.context.taskId]);
  await restart.acknowledge(f.context.taskId);
  expect(await restart.pending()).toEqual([]);
  expect(() => restart.assert(f.context)).toThrow("TASK_REVOKED");
  expect(f.state.dispatches).toBe(0);
  f.db.close();
});
it("S31 lost backend receipt ACK preserves local receipt and prevents redispatch", async () => {
  const f = await fixture();
  const ports: RuntimePorts = f.ports;
  ports.journal = new ReceiptSyncJournal(f.journal, async () => {
    throw new Error("ACK_LOST");
  });
  const p = await f.runtime.prepare("web.fill", f.intent);
  const a = await f.runtime.requestApproval(p.step.id);
  if (a.kind !== "approved") throw new Error();
  await expect(f.runtime.execute(p.step.id, a.receipt.id)).rejects.toThrow(
    "ACK_LOST",
  );
  const reserved = await new IndexedDbDispatchJournal(
    f.db,
    f.context.partitionId,
  ).reserve(`dispatch_${p.step.toolCallId}`, p.step);
  expect(reserved.fresh).toBe(false);
  expect(reserved.receipt).toMatchObject({
    dispatch: "dispatched",
    verification: "passed",
    commands: 1,
  });
  expect(f.state.dispatches).toBe(1);
  f.db.close();
});
it("S31 Stop during a multi-command adapter prevents the next command", async () => {
  const f = await fixture();
  const revocation = new BrowserRevocations(f.db, f.context.partitionId);
  await revocation.restore();
  const ports: RuntimePorts = f.ports;
  ports.browser = revocation.guard(f.ports.browser);
  f.adapter.dispatch = async (_value, before) => {
    before();
    f.state.dispatches++;
    await revocation.stop(f.context.taskId);
    before();
    f.state.dispatches++;
    return { commands: 2 };
  };
  const p = await f.runtime.prepare("web.fill", f.intent);
  const a = await f.runtime.requestApproval(p.step.id);
  if (a.kind !== "approved") throw new Error();
  expect(await f.runtime.execute(p.step.id, a.receipt.id)).toMatchObject({
    dispatch: "unknown",
    error: "TASK_REVOKED",
  });
  expect(f.state.dispatches).toBe(1);
  f.db.close();
});
