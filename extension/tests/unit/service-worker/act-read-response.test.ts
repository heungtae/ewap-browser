import { describe, expect, it, vi } from "vitest";
import type { ProviderRuntime } from "../../../src/providers/runtime.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";

describe("Act read response", () => {
  it("returns_a_page_answer_without_an_action_review_when_the_model_uses_no_tool", async () => {
    const coordinator = new ServiceCoordinator({
      permission_origins: ["<all_urls>"],
      page_read_origins: ["<all_urls>"],
      profile_resolver_origins: [],
      llm_egress_origins: [],
    });
    const publish = vi.fn();
    const endSession = vi.fn();
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => ({
          content: "이 페이지는 Remote Development using SSH를 설명합니다.",
          tool_calls: [],
        }),
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
        origin: "https://code.visualstudio.com",
        path: "/docs/remote/ssh",
        snapshot: {
          schema_version: 2,
          document_epoch: "epoch-abcdefghijklmnop",
          frame_id: 0,
          visible_text: "Remote Development using SSH",
          nodes: [],
        },
      }),
      threadContext: () => [],
      pageScope: () => "scope" as never,
      bindRun: () => undefined,
      publish,
      serialise: JSON.stringify,
      endSession,
    });
    const session = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://code.visualstudio.com",
      prompt: "페이지를 요약해줘",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "페이지를 요약해줘" },
      ],
      profile: { id: "page-derived-ui-v1", version: 1 },
      discovery: "page-derived",
      definitions: [],
      profileDefinitions: [],
    } satisfies ActSession;

    await expect(runner.runStep(session)).resolves.toEqual({
      ok: true,
      state: "ANSWER",
      message: "이 페이지는 Remote Development using SSH를 설명합니다.",
    });
    expect(endSession).toHaveBeenCalledWith(session);
    expect(
      publish.mock.calls.some(
        ([, event]) => event.type === "action_review_required",
      ),
    ).toBe(false);
  });
});
