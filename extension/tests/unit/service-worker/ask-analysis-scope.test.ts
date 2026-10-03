import { describe, expect, it, vi } from "vitest";
import { createAskChatRunner } from "../../../src/service-worker/ask-chat-runner.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import { defaultAgentPreferences } from "../../../src/policy/permission-mode.js";
import type { ProviderRuntime } from "../../../src/providers/runtime.js";
import type { ProviderMessage } from "../../../src/providers/types.js";

const scope = {
  document_epoch: "doc",
  page_scope_epoch: "scope",
  origin: "https://fixture.invalid",
  path: "/report",
};
const data = {
  source: { kind: "page_api_read" as const, label: "reviewed page summary" },
  coverage: "complete" as const,
  collected_count: 1,
  records: [{ index: 0, cells: ["private record"] }],
  truncated: false,
};
describe("Ask analysis provider scope", () => {
  it.each([2, 3, 4])(
    "does not dispatch/reuse/publish data when scope changes at snapshot %i",
    async (changeAt) => {
      const coordinator = new ServiceCoordinator({
        permission_origins: ["<all_urls>"],
        page_read_origins: ["<all_urls>"],
        profile_resolver_origins: [],
        llm_egress_origins: [],
      });
      let reads = 0;
      const publish = vi.fn();
      const chat = vi.fn(
        async (
          _input: unknown,
          options?: { onDelta?: (text: string) => void },
        ) => {
          options?.onDelta?.("stale streamed answer");
          return {
            content: "",
            tool_calls: [
              {
                id: "call-abcdefghijklmnop",
                name: "get_page_text",
                arguments: "{}",
              },
            ],
          };
        },
      );
      const runner = createAskChatRunner({
        coordinator,
        chrome: {
          tabs: { sendMessage: async () => ({ ok: true, text: "safe page" }) },
        } as never,
        provider: { chat } as unknown as ProviderRuntime,
        preferences: defaultAgentPreferences,
        readActive: async () => {
          reads++;
          return {
            tabId: 9,
            origin: scope.origin,
            path: scope.path,
            snapshot: {
              schema_version: 2 as const,
              document_epoch: "doc",
              frame_id: 0,
              visible_text: "safe page text for tool loop",
              nodes: [],
            },
          };
        },
        resolveProfile: async () => undefined as never,
        pageScope: () => ({
          ...scope,
          page_scope_epoch: reads >= changeAt ? "changed" : "scope",
        }),
        threadContext: () => [] as ProviderMessage[],
        bindRun: () => undefined,
        publish,
        safeFailure: (code) => ({ ok: false, code }),
        askTools: [],
        systemPrompt: "system",
        serialise: JSON.stringify,
        redactedTitle: (value) => value ?? "",
        providerFetch: fetch,
        vision: () => undefined,
        rememberVision: () => undefined,
        releaseVision: () => undefined,
        collectAnalysisData: async () => data,
      });
      await expect(
        runner({ mode: "ask", prompt: "Analyze data" }),
      ).rejects.toMatchObject({ code: "PAGE_SCOPE_STALE" });
      expect(chat).toHaveBeenCalledTimes(changeAt === 2 ? 0 : 1);
      expect(
        publish.mock.calls.some(
          ([, event]) => event.type === "assistant_delta",
        ),
      ).toBe(false);
      expect(coordinator.runs.get(9)).toMatchObject({
        phase: "TERMINAL",
        outcome: "FAILED",
        code: "PAGE_SCOPE_STALE",
      });
    },
  );
});
