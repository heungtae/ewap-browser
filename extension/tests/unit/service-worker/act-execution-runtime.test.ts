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
  it("does_not_dispatch_when_the_completion_contract_is_unsupported", async () => {
    let dispatched = 0;
    const runtime = createActExecutionRuntime({
      boundedCdp: {
        execute: async () => {
          dispatched += 1;
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
      transition: () => undefined,
      safeFailure: (code) => ({ ok: false, code }),
      verifier: {
        bounded: async () => false,
        canVerify: () => false,
        navigationTarget: () => undefined,
        semantic: async () => false,
        waitForSameOriginNavigation: async () => false,
        waitForNavigation: async () => false,
      },
    });
    await expect(
      runtime.executeBounded(run, ready, "https://portal.company.test"),
    ).resolves.toEqual({ ok: false, code: "UNSUPPORTED_COMPLETION" });
    expect(dispatched).toBe(0);
  });

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

  it("does_not_treat_an_undeclared_page_transition_as_click_completion", async () => {
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
    ).resolves.toEqual({
      ok: false,
      code: "POSTCONDITION_UNVERIFIED",
      outcome: "UNKNOWN",
    });
    expect(terminal).toEqual(["UNKNOWN"]);
  });

  it("enters_result_verification_before_a_bounded_click_dispatches", async () => {
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
      transition: () => order.push("verifying-result"),
      safeFailure: (code) => ({ ok: false, code }),
      verifier: {
        bounded: async () => false,
        navigationTarget: () => undefined,
        semantic: async () => false,
        waitForPageTransition: async () => true,
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
    expect(order).toEqual(["verifying-result", "dispatch"]);
  });

  it("records_navigation_unverified_when_the_destination_snapshot_never_validates", async () => {
    const terminal: Array<[string, string | undefined]> = [];
    const runtime = createActExecutionRuntime({
      boundedCdp: undefined,
      documentFor: () => undefined,
      isRunActive: () => true,
      permitCdp: () => undefined,
      revokeCdp: () => undefined,
      createId: () => "action-token-abcdefghijklmnop",
      send: async () => ({
        ok: true,
        postcondition: "navigation",
        target_url: "https://portal.company.test/after",
      }),
      tab: async () => ({ url: "https://portal.company.test/before" }),
      terminal: (_run, outcome, code) => terminal.push([outcome, code]),
      transition: () => undefined,
      safeFailure: (code) => ({ ok: false, code }),
      verifier: {
        bounded: async () => false,
        navigationTarget: (url) => (typeof url === "string" ? url : undefined),
        semantic: async () => false,
        waitForPageTransition: async () => false,
        waitForSameOriginNavigation: async () => false,
        waitForNavigation: async () => true,
      },
    });

    await expect(
      runtime.executeContent(
        run,
        { ...ready, intent: { ...ready.intent, tool: "navigate" } },
        "https://portal.company.test",
      ),
    ).resolves.toEqual({
      ok: false,
      code: "NAVIGATION_UNVERIFIED",
      outcome: "UNKNOWN",
    });
    expect(terminal).toEqual([["UNKNOWN", "NAVIGATION_UNVERIFIED"]]);
  });
});
