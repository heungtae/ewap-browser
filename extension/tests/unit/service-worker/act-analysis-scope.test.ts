import { describe, expect, it, vi } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import type { ProviderRuntime } from "../../../src/providers/runtime.js";
import { defaultAgentPreferences } from "../../../src/policy/permission-mode.js";

const pageScope = {
  document_epoch: "doc",
  page_scope_epoch: "scope",
  origin: "https://fixture.invalid",
  path: "/report",
};
describe("Act analysis provider boundary", () => {
  it.each(["answer", "proposal", "lookup failure"])(
    "rejects a stale provider %s without publishing or execution",
    async (result) => {
      const coordinator = new ServiceCoordinator({
        permission_origins: ["<all_urls>"],
        page_read_origins: ["<all_urls>"],
        profile_resolver_origins: [],
        llm_egress_origins: [],
      });
      let changed = false;
      const publish = vi.fn();
      const execute = vi.fn(async () => ({ ok: true }));
      const endSession = vi.fn();
      const runner = createActStepRunner({
        coordinator,
        preferences: defaultAgentPreferences,
        provider: {
          chat: async () => {
            changed = true;
            return result === "proposal"
              ? {
                  content: "stale proposal",
                  tool_calls: [
                    {
                      id: "call-abcdefghijklmnop",
                      name: "propose_click",
                      arguments: "{}",
                    },
                  ],
                }
              : { content: "stale answer", tool_calls: [] };
          },
        } as unknown as ProviderRuntime,
        readActive: async () => {
          if (changed && result === "lookup failure")
            throw new Error("unavailable");
          return {
            tabId: 9,
            origin: pageScope.origin,
            path: pageScope.path,
            snapshot: {
              schema_version: 2 as const,
              document_epoch: "doc",
              frame_id: 0,
              visible_text: "",
              nodes: [],
            },
          };
        },
        pageScope: () => ({
          ...pageScope,
          page_scope_epoch: changed ? "changed" : "scope",
        }),
        threadContext: () => [],
        bindRun: () => undefined,
        publish,
        serialise: JSON.stringify,
        executeApprovedProposal: execute,
        endSession,
      });
      const session: ActSession = {
        id: "session",
        tabId: 9,
        origin: pageScope.origin,
        prompt: "Analyze data and save",
        profile: { id: "fixture", version: 1 },
        messages: [{ role: "system", content: "system" }],
        definitions: [],
        profileDefinitions: [],
        discovery: "page-derived",
        continueAfterApproval: true,
        analysisScope: pageScope,
        analysisData: {
          source: { kind: "page_api_read", label: "reviewed page summary" },
          coverage: "complete",
          collected_count: 1,
          records: [{ index: 0, cells: ["private record"] }],
          truncated: false,
        },
      };
      await expect(runner.runStep(session)).rejects.toThrow();
      expect(coordinator.runs.get(9)).toMatchObject({
        phase: "TERMINAL",
        outcome: "FAILED",
      });
      expect(execute).not.toHaveBeenCalled();
      expect(endSession).toHaveBeenCalledWith(session);
      expect(
        publish.mock.calls.some(
          ([, event]) =>
            event.type === "assistant_delta" ||
            event.type === "action_review_required",
        ),
      ).toBe(false);
    },
  );
});
