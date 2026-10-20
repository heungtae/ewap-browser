import { expect, it } from "vitest";
import { runtimeFixture } from "../../../fixture/s30/runtime-fixture.js";
import { digest } from "../../../../../packages/codebase-schema/src/index.js";
async function fixture() {
  const { IDBFactory } = await import("fake-indexeddb");
  return runtimeFixture(new IDBFactory());
}
it("S30 preserves executed effects separately from missing or failed verification", async () => {
  for (const missing of [true, false]) {
    const f = await fixture();
    f.adapter.observe = async () => {
      if (f.state.dispatches && missing) throw new Error("MISSING_VERIFIER");
      return { passed: false, digest: await digest("not satisfied") };
    };
    const p = await f.runtime.prepare("web.fill", f.intent);
    const a = await f.runtime.requestApproval(p.step.id);
    if (a.kind !== "approved") throw new Error();
    expect(await f.runtime.execute(p.step.id, a.receipt.id)).toMatchObject({
      dispatch: "dispatched",
      commands: 1,
      verification: missing ? "unknown" : "failed",
      goalVerified: false,
    });
    expect(f.state.dispatches).toBe(1);
    f.db.close();
  }
});
it("S30 blocks dispatch after the execution deadline even when the adapter resumes late", async () => {
  const f = await fixture();
  let now = Date.now();
  f.ports.now = () => now;
  f.adapter.dispatch = async (_value, before) => {
    now += 10001;
    before();
    f.state.dispatches++;
    return { commands: 1 };
  };
  const p = await f.runtime.prepare("web.fill", f.intent);
  const a = await f.runtime.requestApproval(p.step.id);
  if (a.kind !== "approved") throw new Error();
  expect(await f.runtime.execute(p.step.id, a.receipt.id)).toMatchObject({
    dispatch: "not_dispatched",
    commands: 0,
    error: "TOOL_DEADLINE",
  });
  expect(f.state.dispatches).toBe(0);
  f.db.close();
});
it("S30 fails closed for missing verifier and stale source refs before approval", async () => {
  const f = await fixture();
  f.adapter.snapshot.verifierId = "";
  await expect(f.runtime.prepare("web.fill", f.intent)).rejects.toThrow(
    "TARGET_BINDING_INVALID",
  );
  f.sources.revoke();
  await expect(f.runtime.prepare("web.fill", f.intent)).rejects.toThrow(
    "ARGUMENT_SOURCE_STALE",
  );
  expect(f.state.dispatches).toBe(0);
  f.db.close();
});
