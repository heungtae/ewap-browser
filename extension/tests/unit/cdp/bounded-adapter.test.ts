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
  options: { granted?: boolean; detachFails?: boolean } = {},
) => {
  const calls: string[] = [];
  const api: DebuggerApi = {
    async attach() {
      calls.push("attach");
    },
    async sendCommand(_target, method) {
      calls.push(method);
      if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
      if (method === "DOM.querySelectorAll") return { nodeIds: [2] };
      if (method === "DOM.getBoxModel")
        return { model: { content: [10, 10, 20, 10, 20, 20, 10, 20] } };
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
          occluded: false,
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

  it("given_unknown_key_when_validating_then_rejected_before_prepare", async () => {
    const { adapter, calls } = fixture();
    await expect(
      adapter.execute(
        { ...action, tool: "press_key_by_ref", capability: "type" },
        { key: "F12" },
      ),
    ).rejects.toThrow("CDP_COMMAND_NOT_ALLOWED");
    expect(calls).toEqual([]);
  });
});
