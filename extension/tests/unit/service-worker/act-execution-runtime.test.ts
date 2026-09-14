import { describe, expect, it } from "vitest";
import type { ReadyExecution } from "../../../src/state/mutation-coordinator.js";
import type { Run } from "../../../src/state/run-coordinator.js";
import { createActExecutionRuntime } from "../../../src/service-worker/act-execution-runtime.js";

const run: Run = {
  id: "run-abcdefghijklmnop",
  tabId: 1,
  frameId: 0,
  documentEpoch: "epoch-abcdefghijklmnop",
  mode: "act",
  tabContext: "context-abcdefghijkl",
  phase: "EXECUTING",
};
const ready: ReadyExecution = {
  state: "READY_TO_EXECUTE",
  intent: {
    tool: "click_by_ref",
    run_id: run.id,
    tab_id: run.tabId,
    frame_id: run.frameId,
    document_epoch: run.documentEpoch,
    profile: { id: "profile", version: 1 },
    ref_id: "target-abcdefghijklmnop",
    risk: "R1",
    effect: "local-ui-only",
    verifier: {
      kind: "semantic-state-transition",
      declaration_id: "click-v1",
      pre_state_digest: "digest",
      required_changes: [],
    },
  },
};

describe("Act execution runtime", () => {
  it("preserves_unknown_when_cdp_dispatched_but_the_postcondition_cannot_be_verified", async () => {
    const terminal: string[] = [];
    const runtime = createActExecutionRuntime({
      boundedCdp: {
        execute: async () => ({ dispatched: true, outcome: "DISPATCHED" }),
      } as never,
      documentFor: () => ({ epoch: run.documentEpoch, documentId: "document" }),
      isRunActive: () => true,
      permitCdp: () => undefined,
      revokeCdp: () => undefined,
      createId: () => "action-token-abcdefghijklmnop",
      send: async () => ({}),
      tab: async () => ({ url: "https://portal.company.test/before" }),
      terminal: (_run, outcome) => terminal.push(outcome),
      transition: () => undefined,
      safeFailure: (code) => ({ ok: false, code }),
      verifier: {
        bounded: async () => false,
        navigationTarget: () => undefined,
        semantic: async () => false,
        waitForSameOriginNavigation: async () => false,
        waitForNavigation: async () => false,
      },
    });

    await expect(
      runtime.executeBounded(run, ready, "https://portal.company.test"),
    ).resolves.toEqual({
      ok: false,
      code: "POSTCONDITION_UNVERIFIED",
      outcome: "UNKNOWN",
    });
    expect(terminal).toEqual(["UNKNOWN"]);
  });

  it("verifies_a_same_origin_page_transition_after_a_bounded_click", async () => {
    const terminal: string[] = [];
    const runtime = createActExecutionRuntime({
      boundedCdp: {
        execute: async () => ({ dispatched: true, outcome: "DISPATCHED" }),
      } as never,
      documentFor: () => ({ epoch: run.documentEpoch, documentId: "document" }),
      isRunActive: () => true,
      permitCdp: () => undefined,
      revokeCdp: () => undefined,
      createId: () => "action-token-abcdefghijklmnop",
      send: async () => ({}),
      tab: async () => ({ url: "https://portal.company.test/before" }),
      terminal: (_run, outcome) => terminal.push(outcome),
      transition: () => undefined,
      safeFailure: (code) => ({ ok: false, code }),
      verifier: {
        bounded: async () => false,
        navigationTarget: () => undefined,
        semantic: async () => false,
        waitForSameOriginNavigation: async () => true,
        waitForNavigation: async () => false,
      },
    });

    await expect(
      runtime.executeBounded(run, ready, "https://portal.company.test"),
    ).resolves.toEqual({ ok: true, outcome: "VERIFIED", navigation: true });
    expect(terminal).toEqual(["VERIFIED"]);
  });

  it("enters_navigation_verification_before_an_undetermined_click_dispatches", async () => {
    const order: string[] = [];
    const runtime = createActExecutionRuntime({
      boundedCdp: {
        execute: async () => {
          order.push("dispatch");
          return { dispatched: true, outcome: "DISPATCHED" };
        },
      } as never,
      documentFor: () => ({ epoch: run.documentEpoch, documentId: "document" }),
      isRunActive: () => true,
      permitCdp: () => undefined,
      revokeCdp: () => undefined,
      createId: () => "action-token-abcdefghijklmnop",
      send: async () => ({}),
      tab: async () => ({ url: "https://portal.company.test/before" }),
      terminal: () => undefined,
      transition: () => order.push("verifying-navigation"),
      safeFailure: (code) => ({ ok: false, code }),
      verifier: {
        bounded: async () => false,
        navigationTarget: () => undefined,
        semantic: async () => {
          throw new Error("undetermined click must not use a digest fallback");
        },
        waitForPageTransition: async () => true,
        waitForSameOriginNavigation: async () => false,
        waitForNavigation: async () => false,
      },
    });

    await expect(
      runtime.executeBounded(run, ready, "https://portal.company.test"),
    ).resolves.toEqual({ ok: true, outcome: "VERIFIED", navigation: true });
    expect(order).toEqual(["verifying-navigation", "dispatch"]);
  });
});
