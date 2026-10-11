import { afterEach, describe, expect, it, vi } from "vitest";
import { createActPostconditionVerifier } from "../../../src/service-worker/act-postcondition-verifier.js";
import type { Run } from "../../../src/state/run-coordinator.js";

const run: Run = {
  id: "run-abcdefghijklmnop",
  tabId: 7,
  frameId: 0,
  documentEpoch: "epoch-before-abcdefghijkl",
  mode: "act",
  tabContext: "context-abcdefghijkl",
  phase: "VERIFYING_NAVIGATION",
};
const scope = {
  document_epoch: run.documentEpoch,
  page_scope_epoch: "scope-after-abcdefghijkl",
};
const before = { ...scope, page_scope_epoch: "scope-before-abcdefghijkl" };
afterEach(() => vi.useRealTimers());
describe("navigation destination evidence", () => {
  it("R04 waits for the unique declared destination marker after shell registration", async () => {
    vi.useFakeTimers();
    let reads = 0;
    const verifier = createActPostconditionVerifier({
      readAll: async () => ({
        tabId: 7,
        snapshot: {
          document_epoch: run.documentEpoch,
          nodes: [
            {
              ref_id: "node-abcdefghijklmnop",
              role: "dialog",
              name: ++reads > 1 ? "Pricing" : "Loading",
              visible: true,
              state: {},
            },
          ],
        },
      }),
      send: async () => ({}),
      tab: async () => ({ url: "https://fixture.test/pricing" }),
      scope: () => scope,
    });
    const pending = verifier.waitForPageTransition(
      run,
      "https://fixture.test/before",
      "https://fixture.test",
      "https://fixture.test/pricing",
      before,
      { role: "dialog", name: "Pricing" },
    );
    await vi.advanceTimersByTimeAsync(201);
    expect(await pending).toBe(true);
    expect(reads).toBe(2);
  });
  it.each(["wrong-url", "missing", "duplicate", "truncated"])(
    "R04 refuses %s at the navigation deadline",
    async (condition) => {
      vi.useFakeTimers();
      const marker = {
        ref_id: "node-abcdefghijklmnop",
        role: "dialog",
        name: "Pricing",
        visible: true,
        state: {},
      };
      const verifier = createActPostconditionVerifier({
        readAll: async () => ({
          tabId: 7,
          snapshot: {
            document_epoch: run.documentEpoch,
            nodes:
              condition === "missing"
                ? []
                : condition === "duplicate"
                  ? [marker, marker]
                  : [marker],
            truncated: condition === "truncated",
          },
        }),
        send: async () => ({}),
        tab: async () => ({
          url:
            condition === "wrong-url"
              ? "https://fixture.test/other"
              : "https://fixture.test/pricing",
        }),
        scope: () => scope,
      });
      const pending = verifier.waitForPageTransition(
        run,
        "https://fixture.test/before",
        "https://fixture.test",
        "https://fixture.test/pricing",
        before,
        { role: "dialog", name: "Pricing" },
      );
      await vi.advanceTimersByTimeAsync(15_201);
      expect(await pending).toBe(false);
    },
  );
});
