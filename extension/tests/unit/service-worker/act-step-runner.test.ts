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
const policy = {
  permission_origins: ["<all_urls>"],
  page_read_origins: ["<all_urls>"],
  profile_resolver_origins: [],
  llm_egress_origins: [],
};
const preferences = () => ({
  permission_mode: "standard" as const,
  default_read_scope: "all_dom" as const,
  screenshot_policy: "manual_or_model" as const,
  group_tools_in_timeline: true,
  show_tool_debug_details: false,
});
describe("Act step runner", () => {
  it("reviews_the_initial_proposal_then_continues_the_approved_session", async () => {
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const executeApprovedProposal = vi.fn(async () => ({ ok: true }));
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
                arguments: JSON.stringify({
                  target: modelRef,
                  approval_scope: "session",
                  approval_reason: "메뉴를 순서대로 펼치는 제한된 작업입니다.",
                }),
              },
            ],
          };
        },
      } as unknown as ProviderRuntime,
      preferences,
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
      executeApprovedProposal,
      endSession: () => undefined,
    });
    const session: ActSession = {
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
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "ACTION_REVIEW",
    });
    session.continueAfterApproval = true;
    session.autoExecutionCount = 1;
    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
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
      publish.mock.calls.find(
        ([, event]) => event.type === "action_review_required",
      )?.[1],
    ).toMatchObject({
      action: {
        approval_scope: "session",
        approval_reason: "메뉴를 순서대로 펼치는 제한된 작업입니다.",
      },
    });
    expect(executeApprovedProposal).toHaveBeenCalledWith(session);
    expect(
      publish.mock.calls.filter(
        ([, event]) => event.type === "action_review_required",
      ),
    ).toHaveLength(1);
  });

  it("ends_the_run_and_session_when_the_provider_fails_after_run_start", async () => {
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const endSession = vi.fn();
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => Promise.reject(new Error("offline")),
      } as unknown as ProviderRuntime,
      preferences,
      readActive: async () => ({
        tabId: 1,
        origin: "https://portal.company.test",
        path: "/guide",
        snapshot: {
          schema_version: 2,
          document_epoch: "epoch-abcdefghijklmnop",
          frame_id: 0,
          visible_text: "",
          nodes: [],
        },
      }),
      threadContext: () => [],
      pageScope: () => "scope" as never,
      bindRun: () => undefined,
      publish,
      serialise: JSON.stringify,
      executeApprovedProposal: async () => ({ ok: true }),
      endSession,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Open the SSH guide",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [],
      profileDefinitions: [],
    };

    await expect(runner.runStep(session)).rejects.toThrow("offline");
    expect(coordinator.runs.get(1)).toMatchObject({
      phase: "TERMINAL",
      outcome: "FAILED",
      code: "INTERNAL_FAILURE",
    });
    expect(publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ type: "run_terminal", outcome: "FAILED" }),
    );
    expect(endSession).toHaveBeenCalledWith(session);
  });
});
