import { describe, expect, it, vi } from "vitest";
import type { ProfileActionTool } from "../../../src/profile/profile.js";
import type { ProviderRuntime } from "../../../src/providers/runtime.js";
import type { ProviderToolDefinition } from "../../../src/providers/types.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";

const definition: ProfileActionTool = {
  tool: "click_by_ref",
  effect: "local-ui-only",
  risk: "R1",
  eligible_roles: ["button"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "click-v1",
    pre_state_digest: "digest",
    required_changes: [],
  },
};

describe("Act step runner", () => {
  it("requires_a_review_for_every_followup_proposal", async () => {
    const coordinator = new ServiceCoordinator({
      permission_origins: ["<all_urls>"],
      page_read_origins: ["<all_urls>"],
      profile_resolver_origins: [],
      llm_egress_origins: [],
    });
    const publish = vi.fn();
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async (input: { tools?: ProviderToolDefinition[] }) => {
          const parameters = input.tools?.[0]?.function.parameters as {
            properties?: { target?: { enum?: unknown[] } };
          };
          const target = parameters.properties?.target;
          const modelRef = target?.enum?.[0];
          if (typeof modelRef !== "string") throw new Error("missing target");
          return {
            content: "",
            tool_calls: [
              {
                id: "tool-call-abcdefghijkl",
                name: "propose_click",
                arguments: JSON.stringify({ target: modelRef }),
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
        origin: "https://portal.company.test",
        path: "/guide",
        snapshot: {
          schema_version: 2,
          document_epoch: "epoch-abcdefghijklmnop",
          frame_id: 0,
          visible_text: "",
          nodes: [
            {
              ref_id: "target-abcdefghijklmnop",
              role: "button",
              name: "Open SSH guide",
              state: {},
              visible: true,
              enabled: true,
            },
          ],
        },
      }),
      threadContext: () => [],
      pageScope: () => "scope" as never,
      bindRun: () => undefined,
      publish,
      serialise: JSON.stringify,
      endSession: () => undefined,
    });
    const session = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Open the SSH guide",
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "Open the SSH guide" },
      ],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [definition],
      profileDefinitions: [],
    } satisfies ActSession;

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "ACTION_REVIEW",
    });
    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "ACTION_REVIEW",
    });
    expect(
      publish.mock.calls.filter(([, event]) => event.type === "user_message"),
    ).toHaveLength(1);
    expect(
      publish.mock.calls.some(
        ([, event]) => event.type === "action_review_required",
      ),
    ).toBe(true);
    expect(
      publish.mock.calls.filter(
        ([, event]) => event.type === "action_review_required",
      ),
    ).toHaveLength(2);
  });
});
