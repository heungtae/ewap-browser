import { describe, expect, it } from "vitest";
import { recoverCdpSessions } from "../../../src/cdp/cdp-recovery.js";
import type {
  DebuggerApi,
  MarkerStore,
  SessionMarker,
} from "../../../src/cdp/bounded-adapter.js";

const marker = (tabId: number): SessionMarker => ({
  tabId,
  runId: "run",
  actionId: "action",
  phase: "attached",
});

describe("CDP restart recovery", () => {
  it("detaches only an owned session and clears an absent one", async () => {
    const calls: string[] = [];
    const api: DebuggerApi = {
      async attach() {
        throw new Error("unexpected attach");
      },
      async sendCommand(target, method) {
        calls.push(`${target.tabId}:${method}`);
        if (target.tabId === 2) throw new Error("Debugger is not attached");
        return {};
      },
      async detach(target) {
        calls.push(`${target.tabId}:detach`);
      },
    };
    const store: MarkerStore = {
      async list() {
        return [marker(1), marker(2)];
      },
      async set() {},
      async clear(tabId) {
        calls.push(`${tabId}:clear`);
      },
    };
    const quarantined: number[] = [];
    await recoverCdpSessions(api, store, (tabId) => quarantined.push(tabId));
    expect(calls).toEqual([
      "1:DOM.getDocument",
      "1:DOM.disable",
      "1:detach",
      "1:clear",
      "2:DOM.getDocument",
      "2:clear",
    ]);
    expect(quarantined).toEqual([]);
  });

  it("quarantines an ambiguous probe or detach failure", async () => {
    const cleared: number[] = [];
    const api: DebuggerApi = {
      async attach() {},
      async sendCommand(target) {
        if (target.tabId === 1) throw new Error("probe failed");
        return {};
      },
      async detach() {
        throw new Error("detach failed");
      },
    };
    const store: MarkerStore = {
      async list() {
        return [marker(1), marker(2)];
      },
      async set() {},
      async clear(tabId) {
        cleared.push(tabId);
      },
    };
    const quarantined: number[] = [];
    await recoverCdpSessions(api, store, (tabId) => quarantined.push(tabId));
    expect(quarantined).toEqual([1, 2]);
    expect(cleared).toEqual([]);
  });
});
