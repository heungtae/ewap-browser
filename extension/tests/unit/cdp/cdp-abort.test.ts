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

describe("bounded CDP cancellation", () => {
  it("detaches a live owned session and prevents input after Stop", async () => {
    const calls: string[] = [];
    let releaseAttributes: (() => void) | undefined;
    let reachedAttributes: (() => void) | undefined;
    const inAttributes = new Promise<void>((resolve) => {
      reachedAttributes = resolve;
    });
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
        if (method === "DOM.getAttributes") {
          reachedAttributes?.();
          await new Promise<void>((resolve) => {
            releaseAttributes = resolve;
          });
          return {
            attributes: ["data-contextpilot-action-token", action.actionToken],
          };
        }
        return {};
      },
      async detach() {
        calls.push("detach");
      },
    };
    const adapter = new BoundedCdpAdapter(
      api,
      { async set() {}, async clear() {} },
      {
        async prepare() {
          return {
            unique: true,
            sensitive: false,
            stale: false,
            visible: true,
            enabled: true,
            occluded: false,
            editable: false,
            viewportWidth: 100,
            viewportHeight: 100,
          };
        },
        async clear() {},
      },
      () => true,
    );
    const executing = adapter.execute(action);
    await inAttributes;
    await adapter.abortTab(action.tabId);
    releaseAttributes?.();
    await expect(executing).rejects.toThrow("PERMISSION_REQUIRED");
    expect(calls.filter((method) => method === "detach")).toHaveLength(1);
    expect(calls.some((method) => method.startsWith("Input."))).toBe(false);
  });
});
