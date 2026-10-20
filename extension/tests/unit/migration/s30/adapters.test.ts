import { describe, expect, it } from "vitest";
import { setup } from "../../../fixture/s30/setup.js";
import {
  bindCdpText,
  bindReviewedOperation,
} from "../../../../../packages/browser-runtime/src/index.js";
import { digest } from "../../../../../packages/codebase-schema/src/index.js";
describe("S30 reviewed adapters", () => {
  it("allows only bounded current focused CDP text and records uncertain dispatch", async () => {
    const f = await setup();
    let sends = 0;
    let focused = true;
    const adapter = await bindCdpText({
      context: f.context,
      target: f.target,
      effect: f.effect,
      async currentEmptyFocus() {
        return focused;
      },
      async observe() {
        return { passed: false, digest: await digest("empty") };
      },
      async insertText() {
        sends++;
        throw new Error("transport secret");
      },
    });
    await expect(adapter.dispatch("text", () => {})).rejects.toMatchObject({
      message: "CDP_DISPATCH_UNKNOWN",
      commands: 1,
    });
    expect(sends).toBe(1);
    focused = false;
    await expect(adapter.dispatch("text", () => {})).rejects.toThrow(
      "CDP_FOCUS_STALE",
    );
    expect(sends).toBe(1);
  });
  it("requires a registered typed action and independent verifier", async () => {
    const f = await setup();
    let current = true;
    let effects = 0;
    let observed = false;
    const adapter = await bindReviewedOperation({
      tool: "web.invoke_action",
      context: f.context,
      target: f.target,
      effect: {
        ...f.effect,
        mechanism: "invoke_registered",
        business: "write",
      },
      adapterId: "reviewed-update",
      verifierId: "read-back",
      validate: (value) =>
        typeof value === "object" && value.status === "approved",
      current: () => current,
      async execute(_v, before) {
        before();
        effects++;
        return { commands: 1 };
      },
      async observe() {
        return { passed: observed, digest: await digest(observed) };
      },
    });
    await expect(adapter.preflight({ method: "eval" })).rejects.toThrow();
    expect(await adapter.dispatch({ status: "approved" }, () => {})).toEqual({
      commands: 1,
    });
    expect((await adapter.observe({ status: "approved" })).passed).toBe(false);
    observed = true;
    expect((await adapter.observe({ status: "approved" })).passed).toBe(true);
    current = false;
    await expect(
      adapter.dispatch({ status: "approved" }, () => {}),
    ).rejects.toThrow();
    expect(effects).toBe(1);
  });
});
