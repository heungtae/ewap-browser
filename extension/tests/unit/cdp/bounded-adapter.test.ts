import { describe, expect, it } from "vitest";
import {
  BoundedCdpAdapter,
  type BoundedCdpAction,
  type DebuggerApi,
} from "../../../src/cdp/bounded-adapter.js";

const action: BoundedCdpAction = {
  runId: "run",
  actionId: "action",
  tabId: 7,
  frameId: 0,
  documentId: "document",
  documentEpoch: "epoch",
  refId: "ref",
  tool: "click_by_ref",
  risk: "R1",
  actionToken: "abcdefghijklmnopqrstuv",
  origin: "https://fixture.company.test",
  capability: "click",
};
const fixture = (
  options: {
    granted?: boolean;
    detachFails?: boolean;
    attachFails?: boolean;
    duplicate?: boolean;
    occluded?: boolean;
    outsideViewport?: boolean;
    failCommand?: string;
    failSecondMouse?: boolean;
  } = {},
) => {
  const calls: string[] = [];
  let mouseCalls = 0;
  const api: DebuggerApi = {
    async attach() {
      calls.push("attach");
      if (options.attachFails)
        throw new Error("Another debugger is already attached");
    },
    async sendCommand(_target, method) {
      calls.push(method);
      if (method === "Input.dispatchMouseEvent") mouseCalls += 1;
      if (
        options.failSecondMouse &&
        method === "Input.dispatchMouseEvent" &&
        mouseCalls === 2
      )
        throw new Error("mouse release failed");
      if (options.failCommand === method) throw new Error("CDP failed");
      if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
      if (method === "DOM.querySelectorAll")
        return { nodeIds: options.duplicate ? [2, 3] : [2] };
      if (method === "DOM.getBoxModel")
        return {
          model: {
            content: options.outsideViewport
              ? [110, 10, 120, 10, 120, 20, 110, 20]
              : [10, 10, 20, 10, 20, 20, 10, 20],
          },
        };
      if (method === "DOM.getNodeForLocation") return { nodeId: 2 };
      if (method === "DOM.getAttributes")
        return {
          attributes: ["data-contextpilot-action-token", action.actionToken],
        };
      return {};
    },
    async detach() {
      calls.push("detach");
      if (options.detachFails) throw new Error("detach failed");
    },
  };
  const adapter = new BoundedCdpAdapter(
    api,
    {
      async set() {
        calls.push("marker:set");
      },
      async clear() {
        calls.push("marker:clear");
      },
    },
    {
      async prepare() {
        calls.push("prepare");
        return {
          unique: true,
          sensitive: false,
          stale: false,
          visible: true,
          enabled: true,
          occluded: options.occluded ?? false,
          editable: true,
          viewportWidth: 100,
          viewportHeight: 100,
        };
      },
      async clear() {
        calls.push("clear");
      },
    },
    () => options.granted ?? true,
  );
  return { adapter, calls };
};

describe("bounded CDP adapter", () => {
  it("given_unapproved_origin_when_executing_then_attach_is_never_called", async () => {
    const { adapter, calls } = fixture({ granted: false });
    await expect(adapter.execute(action)).rejects.toThrow(
      "PERMISSION_REQUIRED",
    );
    expect(calls).toEqual([]);
  });

  it("given_bound_unique_target_when_clicking_then_allowlist_dispatches_and_detaches", async () => {
    const { adapter, calls } = fixture();
    await expect(adapter.execute(action)).resolves.toMatchObject({
      outcome: "DISPATCHED",
    });
    expect(calls).toContain("Input.dispatchMouseEvent");
    expect(calls.at(-2)).toBe("detach");
    expect(calls.at(-1)).toBe("marker:clear");
    expect(calls).not.toContain("Runtime.evaluate");
  });

  it("given_detach_failure_when_next_action_then_tab_is_quarantined", async () => {
    const { adapter } = fixture({ detachFails: true });
    await adapter.execute(action);
    expect(adapter.isQuarantined(7)).toBe(true);
    await expect(
      adapter.execute({ ...action, actionId: "next" }),
    ).rejects.toThrow("CDP_CLEANUP_FAILED");
  });

  it("rejects unknown tool, injected action field and unconfirmed R2", async () => {
    const { adapter, calls } = fixture();
    for (const invalid of [
      { ...action, tool: "Runtime.evaluate" },
      { ...action, selector: "#save" },
      { ...action, risk: "R2" },
    ])
      await expect(
        adapter.execute(invalid as BoundedCdpAction),
      ).rejects.toThrow("CDP_COMMAND_NOT_ALLOWED");
    await expect(
      adapter.execute({ ...action, tool: "press_key_by_ref" }, { key: "F12" }),
    ).rejects.toThrow("CDP_COMMAND_NOT_ALLOWED");
    expect(calls).toEqual([]);
  });

  it("rejects duplicate, occluded and out-of-viewport targets before input", async () => {
    for (const options of [
      { duplicate: true },
      { occluded: true },
      { outsideViewport: true },
    ]) {
      const { adapter, calls } = fixture(options);
      await expect(adapter.execute(action)).rejects.toThrow(
        "TARGET_NOT_ACTIONABLE",
      );
      expect(calls.some((method) => method.startsWith("Input."))).toBe(false);
      if (!options.occluded) expect(calls).toContain("detach");
    }
  });

  it("classifies debugger conflict and pre-input failure without dispatch", async () => {
    const conflict = fixture({ attachFails: true });
    await expect(conflict.adapter.execute(action)).rejects.toThrow(
      "CDP_CONFLICT",
    );
    expect(conflict.calls).not.toContain("Input.dispatchMouseEvent");
    const before = fixture({ failCommand: "DOM.getDocument" });
    await expect(before.adapter.execute(action)).resolves.toEqual({
      dispatched: false,
      outcome: "FAILED",
    });
    expect(before.calls).toContain("detach");
  });

  it("classifies failure after mouse press as unknown without retry", async () => {
    const { adapter, calls } = fixture({ failSecondMouse: true });
    const result = await adapter.execute(action);
    expect(result).toEqual({ dispatched: true, outcome: "UNKNOWN" });
    const mouseCalls = calls.filter(
      (method) => method === "Input.dispatchMouseEvent",
    );
    expect(mouseCalls).toHaveLength(2);
    expect(calls).toContain("detach");
  });
});
