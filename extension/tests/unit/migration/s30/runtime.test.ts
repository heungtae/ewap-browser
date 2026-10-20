import { describe, expect, it } from "vitest";
import { runtimeFixture } from "../../../fixture/s30/runtime-fixture.js";
import { IndexedDbDispatchJournal } from "../../../../../packages/browser-runtime/src/index.js";
async function fixture() {
  const { IDBFactory } = await import("fake-indexeddb");
  return runtimeFixture(new IDBFactory());
}
describe("S30 dispatch and authority", () => {
  it("binds arguments, consumes approval once and returns the original receipt", async () => {
    const f = await fixture();
    const prepared = await f.runtime.prepare("web.fill", f.intent);
    const approval = await f.runtime.requestApproval(prepared.step.id);
    expect(approval.kind).toBe("approved");
    if (approval.kind !== "approved") throw new Error();
    const receipt = await f.runtime.execute(
      prepared.step.id,
      approval.receipt.id,
    );
    expect(receipt).toMatchObject({
      toolCallId: prepared.step.toolCallId,
      dispatch: "dispatched",
      commands: 1,
      verification: "passed",
      goalVerified: false,
    });
    expect(
      await f.runtime.execute(prepared.step.id, approval.receipt.id),
    ).toEqual(receipt);
    expect(f.state.dispatches).toBe(1);
    expect(f.state.intents).toBe(1);
    expect(
      await new IndexedDbDispatchJournal(f.db, f.context.partitionId).reserve(
        receipt.dispatchId,
        prepared.step,
      ),
    ).toEqual({ fresh: false, receipt });
    f.db.close();
  });
  it("observes an already satisfied target with zero dispatch or approval", async () => {
    const f = await fixture();
    f.state.value = "requested";
    const p = await f.runtime.prepare("web.fill", f.intent);
    expect(await f.runtime.recordNoOp(p.step.id)).toMatchObject({
      noOp: true,
      commands: 0,
      verification: "passed",
    });
    expect(f.state.dispatches).toBe(0);
    f.db.close();
  });
  it("preserves uncertain reservations across restart and rejects conflicting digests", async () => {
    const f = await fixture();
    const p = await f.runtime.prepare("web.fill", f.intent);
    const id = `dispatch_${p.step.toolCallId}`;
    expect((await f.journal.reserve(id, p.step)).fresh).toBe(true);
    expect(
      await new IndexedDbDispatchJournal(f.db, f.context.partitionId).reserve(
        id,
        p.step,
      ),
    ).toEqual({ fresh: false, receipt: null });
    await expect(
      f.journal.reserve(id, { ...p.step, digest: "0".repeat(64) }),
    ).rejects.toThrow("DISPATCH_CONFLICT");
    f.db.close();
  });
  it("rejects stale document, argument refs and cancelled approval", async () => {
    const f = await fixture();
    const p = await f.runtime.prepare("web.fill", f.intent);
    const a = await f.runtime.requestApproval(p.step.id);
    if (a.kind !== "approved") throw new Error();
    f.runtime.cancel();
    await expect(f.runtime.execute(p.step.id, a.receipt.id)).rejects.toThrow(
      "RUNTIME_CANCELLED",
    );
    f.context.documentEpoch++;
    await expect(f.runtime.prepare("web.fill", f.intent)).rejects.toThrow(
      "RUNTIME_CANCELLED",
    );
    expect(f.state.dispatches).toBe(0);
    f.db.close();
  });
  it("records partial effects as UNKNOWN without redispatch", async () => {
    const f = await fixture();
    f.state.partial = true;
    const p = await f.runtime.prepare("web.fill", f.intent);
    const a = await f.runtime.requestApproval(p.step.id);
    if (a.kind !== "approved") throw new Error();
    const receipt = await f.runtime.execute(p.step.id, a.receipt.id);
    expect(receipt).toMatchObject({
      dispatch: "unknown",
      commands: 1,
      verification: "not_run",
      error: "PARTIAL_DISPATCH",
    });
    await f.runtime.execute(p.step.id, a.receipt.id);
    expect(f.state.dispatches).toBe(1);
    f.db.close();
  });
  it("stops between commands when approval is revoked", async () => {
    const f = await fixture();
    f.adapter.dispatch = async (_v, before) => {
      before();
      f.runtime.cancel();
      before();
      f.state.dispatches++;
      return { commands: 1 };
    };
    const p = await f.runtime.prepare("web.fill", f.intent);
    const a = await f.runtime.requestApproval(p.step.id);
    if (a.kind !== "approved") throw new Error();
    expect(await f.runtime.execute(p.step.id, a.receipt.id)).toMatchObject({
      dispatch: "unknown",
      error: "APPROVAL_REVOKED",
    });
    expect(f.state.dispatches).toBe(0);
    f.db.close();
  });
});
