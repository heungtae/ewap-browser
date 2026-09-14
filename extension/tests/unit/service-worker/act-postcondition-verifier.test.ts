import { describe, expect, it } from "vitest";
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

describe("Act postcondition verifier", () => {
  it("requires_a_changed_scope_and_fresh_snapshot_after_a_url_transition", async () => {
    const milestones: string[] = [];
    let scopeReads = 0;
    const verifier = createActPostconditionVerifier({
      readAll: async () => ({
        tabId: 7,
        snapshot: {
          document_epoch: "epoch-after-abcdefghijkl",
          nodes: [{ ref_id: "node-abcdefghijklmnop", state: {} }],
        },
      }),
      send: async () => ({}),
      tab: async () => ({ url: "https://portal.company.test/after" }),
      scope: () => {
        scopeReads += 1;
        return scopeReads === 1
          ? {
              document_epoch: "epoch-before-abcdefghijkl",
              page_scope_epoch: "scope-before-abcdefghijkl",
            }
          : {
              document_epoch: "epoch-after-abcdefghijkl",
              page_scope_epoch: "scope-after-abcdefghijkl",
            };
      },
      milestone: (_tabId, stage) => milestones.push(stage),
    });

    await expect(
      verifier.waitForPageTransition(
        run,
        "https://portal.company.test/before",
        "https://portal.company.test",
      ),
    ).resolves.toBe(true);
    expect(milestones).toEqual(["URL_OR_SCOPE_CHANGED", "SNAPSHOT_VALIDATED"]);
  });

  it("uses_the_scope_captured_before_a_fast_same_document_transition", async () => {
    const verifier = createActPostconditionVerifier({
      readAll: async () => ({
        tabId: 7,
        snapshot: {
          // A SPA route keeps document_epoch stable; only page scope changes.
          document_epoch: run.documentEpoch,
          nodes: [{ ref_id: "node-abcdefghijklmnop", state: {} }],
        },
      }),
      send: async () => ({}),
      tab: async () => ({ url: "https://portal.company.test/after" }),
      // By verification time the lifecycle event has already replaced this.
      scope: () => ({
        document_epoch: run.documentEpoch,
        page_scope_epoch: "scope-after-abcdefghijkl",
      }),
    });

    await expect(
      verifier.waitForPageTransition(
        run,
        "https://portal.company.test/before",
        "https://portal.company.test",
        undefined,
        {
          document_epoch: run.documentEpoch,
          page_scope_epoch: "scope-before-abcdefghijkl",
        },
      ),
    ).resolves.toBe(true);
  });
});
