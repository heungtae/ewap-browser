import { describe, expect, it, vi } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import type { ProviderRuntime } from "../../../src/providers/runtime.js";

describe("S16 source-only authority", () => {
  it("rejects a hallucinated mutation even if the target exists on the page", async () => {
    const publish = vi.fn();
    const execute = vi.fn();
    const coordinator = new ServiceCoordinator({
      permission_origins: ["<all_urls>"],
      page_read_origins: ["<all_urls>"],
      profile_resolver_origins: [],
      llm_egress_origins: [],
    });
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async (input: { tools?: unknown[] }) => {
          expect(input.tools ?? []).toEqual([]);
          return {
            content: "",
            tool_calls: [
              {
                id: "call-source-abcdefghijkl",
                name: "propose_click",
                arguments: JSON.stringify({ target: "m1" }),
              },
            ],
          };
        },
      } as unknown as ProviderRuntime,
      preferences: () => ({
        permission_mode: "standard",
        default_read_scope: "all_dom",
        screenshot_policy: "manual_or_model",
        group_tools_in_timeline: true,
        show_tool_debug_details: false,
      }),
      readActive: async () => ({
        tabId: 1,
        origin: "https://fixture.test",
        path: "/",
        snapshot: {
          schema_version: 2,
          document_epoch: "epoch-abcdefghijklmnop",
          frame_id: 0,
          visible_text: "Report",
          nodes: [
            {
              ref_id: "target-abcdefghijklmnop",
              role: "button",
              name: "Submit",
              state: {},
              visible: true,
              enabled: true,
              hidden: false,
            },
          ],
        },
      }),
      threadContext: () => [],
      pageScope: () => "scope" as never,
      bindRun: () => undefined,
      publish,
      serialise: JSON.stringify,
      executeApprovedProposal: execute,
      endSession: () => undefined,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      sourceReadOnly: true,
      tabId: 1,
      origin: "https://fixture.test",
      prompt: "Read static source",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [],
      profileDefinitions: [],
    };
    await expect(runner.runStep(session)).rejects.toMatchObject({
      code: "POLICY_DENIED",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(
      publish.mock.calls.some(
        ([, event]) => event.type === "action_review_required",
      ),
    ).toBe(false);
  });
});
