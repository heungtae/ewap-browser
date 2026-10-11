import { describe, expect, it } from "vitest";
import { createActExecutionRuntime } from "../../../src/service-worker/act-execution-runtime.js";
import { digestCanonical } from "../../../src/security/canonical.js";
import type { Run } from "../../../src/state/run-coordinator.js";
import type { ReadyExecution } from "../../../src/state/mutation-coordinator.js";

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
    tool: "navigate",
    run_id: run.id,
    tab_id: 1,
    frame_id: 0,
    document_epoch: run.documentEpoch,
    profile: { id: "profile", version: 1 },
    ref_id: "target-abcdefghijklmnop",
    risk: "R1",
    effect: "local-ui-only",
    verifier: {
      kind: "exact-navigation-transition",
      declaration_id: "navigate-v1",
      pre_page_context_digest: "source-page",
      origin: "https://fixture.test",
      path_template_id: "approved-destination",
      required_post_states: [],
    },
  },
};
describe("ISS-20261011-004 runtime destination binding", () => {
  it.each([true, false])(
    "preserves only a Content reference-bound destination (%s)",
    async (bound) => {
      const scope = {
        document_epoch: run.documentEpoch,
        page_scope_epoch: "source-scope",
      };
      const runtime = createActExecutionRuntime({
        boundedCdp: undefined,
        documentFor: () => undefined,
        isRunActive: () => true,
        permitCdp: () => undefined,
        revokeCdp: () => undefined,
        createId: () => "action-token-abcdefghijklmnop",
        send: async () => ({
          ok: true,
          dispatch: "dispatched",
          postcondition: "navigation",
          target_url: "https://fixture.test/after?mode=1#result",
          navigation_bound: bound,
        }),
        tab: async () => ({ url: "https://fixture.test/before" }),
        scope: () => scope,
        terminal: () => undefined,
        transition: () => undefined,
        safeFailure: (code) => ({ ok: false, code }),
        verifier: {
          bounded: async () => false,
          semantic: async () => false,
          navigationTarget: (url) =>
            typeof url === "string" ? url : undefined,
          waitForPageTransition: async () => false,
          waitForSameOriginNavigation: async () => false,
          waitForNavigation: async () => false,
        },
      });
      const result: Record<string, unknown> = await runtime.executeContent(
        run,
        ready,
        "https://fixture.test",
      );
      expect(result).toMatchObject({
        outcome: "UNKNOWN",
        code: "NAVIGATION_UNVERIFIED",
        dispatch: "dispatched",
      });
      expect(result.navigation_binding).toEqual(
        bound
          ? {
              destination_digest: digestCanonical(
                "https://fixture.test/after?mode=1#result",
              ),
              source_document_epoch: scope.document_epoch,
              source_page_scope_epoch: scope.page_scope_epoch,
            }
          : undefined,
      );
      expect(JSON.stringify(result)).not.toContain("https://fixture.test");
    },
  );
});
