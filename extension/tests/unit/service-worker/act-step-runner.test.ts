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
    const pendingRunId = session.runId!;
    coordinator.runs.transition(pendingRunId, "AWAITING_VALUE");
    await expect(runner.runStep(session, pendingRunId)).resolves.toMatchObject({
      ok: true,
      state: "ACTION_REVIEW",
    });
    expect(session.runId).toBe(pendingRunId);
    expect(coordinator.runs.byId(pendingRunId)?.phase).toBe("PROPOSING");
    await expect(runner.runStep(session, pendingRunId)).rejects.toMatchObject({
      code: "VALUE_BINDING_INVALID",
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
    ).toHaveLength(2);
  });

  it("does_not_complete_from_text_after_opening_an_aria_menu", async () => {
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const endSession = vi.fn();
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => ({
          content: "목록을 열었습니다.",
          tool_calls: [],
        }),
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
      executeApprovedProposal: async () => ({ ok: true }),
      endSession,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "low를 선택해 주세요.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [definition],
      profileDefinitions: [],
      awaitingExpandedMenuSelection: true,
    };

    await expect(runner.runStep(session)).rejects.toMatchObject({
      code: "TARGET_NOT_ACTIONABLE",
    });
    expect(coordinator.runs.get(1)).toMatchObject({
      phase: "TERMINAL",
      outcome: "FAILED",
      code: "TARGET_NOT_ACTIONABLE",
    });
    expect(endSession).toHaveBeenCalledWith(session);
    expect(
      publish.mock.calls.some(
        ([, event]) =>
          event.type === "run_terminal" && event.outcome === "VERIFIED",
      ),
    ).toBe(false);
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

  it("fails_loudly_when_declared_entry_tools_are_narrowed_away", async () => {
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => {
          throw new Error("provider must not be reached after narrowing");
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
            {
              ref_id: "search-abcdefghijklmnop",
              role: "textbox",
              name: "Search query",
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
      executeApprovedProposal: async () => ({ ok: true }),
      endSession: () => undefined,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Open the SSH guide",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [definition],
      profileDefinitions: [definition],
      harnessCapabilities: {
        // Normally-created value: chat-start stores toHarnessRevision(0).
        request_revision: 1,
        read_tools: ["read_page"],
        propose_tools: ["propose_set_text", "propose_click"],
        entry_roles: ["button", "textbox"],
      },
    };

    await expect(runner.runStep(session)).rejects.toMatchObject({
      code: "HARNESS_TOOL_NARROWING",
    });
  });

  it("clarifies_instead_of_dispatching_when_the_review_mismatches", async () => {
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const endSession = vi.fn();
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => ({
          content: "",
          tool_calls: [
            {
              id: "tool-call-abcdefghijkl",
              name: "submit_review",
              arguments: JSON.stringify({
                verdict: "mismatch",
                rationale: "report scope is unrelated to search input",
                missing: [],
              }),
            },
          ],
        }),
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
              name: "Generate preview",
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
      executeApprovedProposal: async () => {
        throw new Error("must not dispatch after mismatch");
      },
      endSession,
    });
    const declaration = {
      schema_version: 1 as const,
      id: "preview-v1",
      title: "Preview",
      steps: [
        {
          id: "step-aaaaaaaaaaaaaa1",
          tool: "click_by_ref" as const,
          target: { role: "button" as const, name: "Generate preview" },
        },
      ],
    };
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Search query에 browser test를 입력해줘.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [],
      profileDefinitions: [],
      harnessReview: {
        candidate_id: "candidate-aaaaaaaaaaaaa1",
        source: "saved",
        request_revision: 1,
        catalog_status: "verified",
        stored_scope: {
          origin: "https://portal.company.test",
          path: "/guide",
        },
        current_origin: "https://portal.company.test",
        approval_id: "approval-runner-mismatch",
        status: "PENDING_REVIEW",
      },
      workflow: {
        declaration,
        step: declaration.steps[0]!,
        count: 0,
      },
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "CLARIFICATION",
    });
    expect(session.harnessReview?.status).toBe("REVIEWED");
    expect(session.harnessReview?.verdict).toBe("mismatch");
    expect(
      publish.mock.calls.some(
        ([, event]) =>
          event.type === "assistant_delta" &&
          typeof event.text === "string" &&
          event.text.includes("맞지 않습니다"),
      ),
    ).toBe(true);
    expect(endSession).toHaveBeenCalledWith(session);
  });

  it("clarifies_on_partial_without_running_the_original_workflow", async () => {
    // F1 repro at the runner level: a Search request with a Preview
    // candidate reviewed as partial must end in clarification with zero
    // dispatches — never the original scope/checkbox/click sequence.
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const endSession = vi.fn();
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => ({
          content: "",
          tool_calls: [
            {
              id: "tool-call-abcdefghijkl",
              name: "submit_review",
              arguments: JSON.stringify({
                verdict: "partial",
                rationale: "scope step fits, input goal differs",
                missing: [],
              }),
            },
          ],
        }),
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
              name: "Generate preview",
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
      executeApprovedProposal: async () => {
        throw new Error("must not dispatch on partial");
      },
      endSession,
    });
    const declaration = {
      schema_version: 1 as const,
      id: "preview-v1",
      title: "Preview",
      steps: [
        {
          id: "step-aaaaaaaaaaaaaa1",
          tool: "click_by_ref" as const,
          target: { role: "button" as const, name: "Generate preview" },
        },
      ],
    };
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Search query에 browser test를 입력해줘.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [],
      profileDefinitions: [],
      harnessReview: {
        candidate_id: "candidate-aaaaaaaaaaaaa1",
        source: "saved",
        request_revision: 1,
        catalog_status: "verified",
        stored_scope: {
          origin: "https://portal.company.test",
          path: "/guide",
        },
        current_origin: "https://portal.company.test",
        approval_id: "approval-runner-partial-aa",
        status: "PENDING_REVIEW",
      },
      workflow: {
        declaration,
        step: declaration.steps[0]!,
        count: 0,
      },
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "CLARIFICATION",
    });
    expect(session.harnessReview?.status).toBe("REVIEWED");
    expect(session.harnessReview?.verdict).toBe("partial");
    expect(
      publish.mock.calls.some(
        ([, event]) =>
          event.type === "assistant_delta" &&
          typeof event.text === "string" &&
          event.text.includes("그대로 실행할 수 없습니다"),
      ),
    ).toBe(true);
    expect(endSession).toHaveBeenCalledWith(session);
  });

  it("treats_a_generation_zero_context_as_the_stored_revision", async () => {
    // F4: chat-start stores toHarnessRevision(0) == 1. The runner must
    // compare against the same single-converted value instead of
    // re-normalizing the stored revision (which previously skipped the
    // narrowing check as stale).
    const coordinator = new ServiceCoordinator(policy);
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => {
          throw new Error("provider must not be reached after narrowing");
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
            {
              ref_id: "search-abcdefghijklmnop",
              role: "textbox",
              name: "Search query",
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
      publish: vi.fn(),
      serialise: JSON.stringify,
      executeApprovedProposal: async () => ({ ok: true }),
      endSession: () => undefined,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Open the SSH guide",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [definition],
      profileDefinitions: [definition],
      requestContext: {
        tabId: 1,
        signal: new AbortController().signal,
        check: () => undefined,
        generation: 0,
      },
      harnessCapabilities: {
        request_revision: 1,
        read_tools: ["read_page"],
        propose_tools: ["propose_set_text", "propose_click"],
        entry_roles: ["button", "textbox"],
      },
    };

    await expect(runner.runStep(session)).rejects.toMatchObject({
      code: "HARNESS_TOOL_NARROWING",
    });
  });

  it("skips_the_narrowing_check_only_on_a_real_revision_change", async () => {
    const coordinator = new ServiceCoordinator(policy);
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => ({ content: "stale answer", tool_calls: [] }),
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
      publish: vi.fn(),
      serialise: JSON.stringify,
      executeApprovedProposal: async () => ({ ok: true }),
      endSession: () => undefined,
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
      requestContext: {
        tabId: 1,
        signal: new AbortController().signal,
        check: () => undefined,
        generation: 5,
      },
      harnessCapabilities: {
        request_revision: 1,
        read_tools: [],
        propose_tools: [],
        entry_roles: [],
      },
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "ANSWER",
    });
  });

  it("records_budget_exhaustion_as_incomplete_instead_of_verified", async () => {
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const endSession = vi.fn();
    const readIds = Array.from(
      { length: 12 },
      (_, index) => `call-budget-${String(index).padStart(12, "0")}`,
    );
    let readTurn = 0;
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async () => ({
          content: "자료를 더 확인하겠습니다.",
          tool_calls: [
            {
              // A thirteenth chat would exceed the S16 round budget; undefined trips
              // the binding check loudly instead of looping forever.
              id: readIds[readTurn++]!,
              name: "read_page",
              arguments: "{}",
            },
          ],
        }),
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
          visible_text: "guide",
          nodes: [],
        },
      }),
      threadContext: () => [],
      pageScope: () => "scope" as never,
      bindRun: () => undefined,
      publish,
      serialise: JSON.stringify,
      executeApprovedProposal: async () => {
        throw new Error("must not dispatch without a proposal");
      },
      endSession,
      readAssist: {
        tabs: {} as never,
        redactTitle: (value: string | undefined) => value ?? "",
      },
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Analyze the guide deeply",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [],
      profileDefinitions: [],
      harnessCapabilities: {
        request_revision: 1,
        read_tools: ["read_page"],
        propose_tools: [],
        entry_roles: [],
      },
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "INCOMPLETE",
      reason: "BUDGET_EXHAUSTED",
    });
    const terminal = publish.mock.calls.find(
      ([, event]) => event.type === "run_terminal",
    )?.[1];
    expect(terminal).toMatchObject({
      outcome: "UNKNOWN",
      code: "CONTEXT_BUDGET_EXCEEDED",
    });
    expect(
      publish.mock.calls.some(
        ([, event]) =>
          event.type === "assistant_delta" &&
          typeof event.text === "string" &&
          event.text.includes("budget"),
      ),
    ).toBe(true);
    expect(endSession).toHaveBeenCalledWith(session);
  });

  it("requires_fresh_review_for_a_new_single_step_value_under_session_continuation", async () => {
    // R1 repro: a prior click/navigation session approval must not carry a
    // new single_step text input past review. Zero execution entries.
    const textDefinition: ProfileActionTool = {
      tool: "set_text_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["textbox"],
      verifier: {
        kind: "semantic-state-transition",
        declaration_id: "text-v1",
        pre_state_digest: "digest",
        required_changes: [],
      },
    };
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const executeApprovedProposal = vi.fn(async () => ({ ok: true }));
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async (input: { tools?: ProviderToolDefinition[] }) => {
          const setText = input.tools?.find(
            (tool) => tool.function.name === "propose_set_text",
          );
          const parameters = setText?.function.parameters as {
            properties?: { target?: { enum?: unknown[] } };
          };
          const modelRef = parameters.properties?.target?.enum?.[0];
          if (typeof modelRef !== "string") throw new Error("missing target");
          return {
            content: "",
            tool_calls: [
              {
                id: "tool-call-abcdefghijkl",
                name: "propose_set_text",
                arguments: JSON.stringify({
                  target: modelRef,
                  value: "browser test",
                  value_source_revision: 1,
                  approval_scope: "single_step",
                  approval_reason: "요청에 명확한 값이 있어 입력합니다.",
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
              ref_id: "search-abcdefghijklmnop",
              role: "textbox",
              name: "Search query",
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
      prompt: "Search query에 browser test를 입력해줘.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [textDefinition],
      profileDefinitions: [textDefinition],
      harnessCapabilities: {
        request_revision: 1,
        read_tools: [],
        propose_tools: ["propose_set_text"],
        entry_roles: ["textbox"],
      },
      continueAfterApproval: true,
      autoExecutionCount: 1,
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "ACTION_REVIEW",
    });
    expect(executeApprovedProposal).not.toHaveBeenCalled();
    expect(
      publish.mock.calls.filter(
        ([, event]) => event.type === "action_review_required",
      ),
    ).toHaveLength(1);
  });

  it("returns_a_missing_value_to_the_model_for_one_bounded_correction", async () => {
    // R4 repro: a schema-valid target-only text proposal in the harness path
    // must come back as that call's contract error (one retry), not FAILED.
    const textDefinition: ProfileActionTool = {
      tool: "set_text_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["textbox"],
      verifier: {
        kind: "semantic-state-transition",
        declaration_id: "text-v1",
        pre_state_digest: "digest",
        required_changes: [],
      },
    };
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const endSession = vi.fn();
    const payloads: Array<{ messages: Array<{ role: string }> }> = [];
    let providerCalls = 0;
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async (input: {
          messages: Array<{ role: string; content: string }>;
          tools?: ProviderToolDefinition[];
        }) => {
          providerCalls++;
          payloads.push({ messages: input.messages });
          const setText = input.tools?.find(
            (tool) => tool.function.name === "propose_set_text",
          );
          const parameters = setText?.function.parameters as {
            properties?: { target?: { enum?: unknown[] } };
          };
          const modelRef = parameters.properties?.target?.enum?.[0];
          if (typeof modelRef !== "string") throw new Error("missing target");
          const withValue = providerCalls > 1;
          return {
            content: "",
            tool_calls: [
              {
                id: `tool-call-abcdefghijkl-${providerCalls}`,
                name: "propose_set_text",
                arguments: JSON.stringify({
                  target: modelRef,
                  ...(withValue
                    ? {
                        value: "browser test",
                        value_source_revision: 1,
                      }
                    : {}),
                  approval_scope: "single_step",
                  approval_reason: "값을 확인합니다.",
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
              ref_id: "search-abcdefghijklmnop",
              role: "textbox",
              name: "Search query",
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
      executeApprovedProposal: async () => {
        throw new Error("must not dispatch without approval");
      },
      endSession,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Search query에 browser test를 입력해줘.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [textDefinition],
      profileDefinitions: [textDefinition],
      harnessCapabilities: {
        request_revision: 1,
        read_tools: [],
        propose_tools: ["propose_set_text"],
        entry_roles: ["textbox"],
      },
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "ACTION_REVIEW",
    });
    expect(providerCalls).toBe(2);
    expect(endSession).not.toHaveBeenCalled();
    // The correction turn carries the contract error for the failed call;
    // no automatic value card is shown and nothing executes.
    const retryPayload = JSON.stringify(payloads[1]);
    expect(retryPayload).toContain("VALUE_BINDING_INVALID");
    expect(retryPayload).toContain("tool-call-abcdefghijkl-1");
    expect(
      publish.mock.calls.some(([, event]) => event.type === "value_required"),
    ).toBe(false);
    expect(
      session.messages.some(
        (message) =>
          message.role === "tool" &&
          message.tool_call_id === "tool-call-abcdefghijkl-1" &&
          message.content.includes("VALUE_BINDING_INVALID"),
      ),
    ).toBe(true);
  });

  it("terminals_after_a_second_consecutive_contract_error", async () => {
    // R4 budget: exactly one correction turn; a repeated contract error ends
    // the run without cards, guesses, or further provider calls.
    const textDefinition: ProfileActionTool = {
      tool: "set_text_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["textbox"],
      verifier: {
        kind: "semantic-state-transition",
        declaration_id: "text-v1",
        pre_state_digest: "digest",
        required_changes: [],
      },
    };
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const endSession = vi.fn();
    let providerCalls = 0;
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async (input: { tools?: ProviderToolDefinition[] }) => {
          providerCalls++;
          const setText = input.tools?.find(
            (tool) => tool.function.name === "propose_set_text",
          );
          const parameters = setText?.function.parameters as {
            properties?: { target?: { enum?: unknown[] } };
          };
          const modelRef = parameters.properties?.target?.enum?.[0];
          if (typeof modelRef !== "string") throw new Error("missing target");
          return {
            content: "",
            tool_calls: [
              {
                id: `tool-call-abcdefghijkl-${providerCalls}`,
                name: "propose_set_text",
                arguments: JSON.stringify({
                  target: modelRef,
                  approval_scope: "single_step",
                  approval_reason: "값을 확인합니다.",
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
              ref_id: "search-abcdefghijklmnop",
              role: "textbox",
              name: "Search query",
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
      executeApprovedProposal: async () => {
        throw new Error("must not dispatch without approval");
      },
      endSession,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Search query에 browser test를 입력해줘.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [textDefinition],
      profileDefinitions: [textDefinition],
      harnessCapabilities: {
        request_revision: 1,
        read_tools: [],
        propose_tools: ["propose_set_text"],
        entry_roles: ["textbox"],
      },
    };

    await expect(runner.runStep(session)).rejects.toMatchObject({
      code: "VALUE_BINDING_INVALID",
    });
    expect(providerCalls).toBe(2);
    expect(endSession).toHaveBeenCalledWith(session);
    expect(
      publish.mock.calls.some(([, event]) => event.type === "value_required"),
    ).toBe(false);
  });

  it("resolves_a_retry_turn_clarification_against_fresh_refs", async () => {
    // F1: the correction turn offers fresh model refs; a targeted question
    // using them must reach the value card, not TARGET_NOT_ACTIONABLE.
    const textDefinition: ProfileActionTool = {
      tool: "set_text_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["textbox"],
      verifier: {
        kind: "semantic-state-transition",
        declaration_id: "text-v1",
        pre_state_digest: "digest",
        required_changes: [],
      },
    };
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    const endSession = vi.fn();
    let providerCalls = 0;
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async (input: { tools?: ProviderToolDefinition[] }) => {
          providerCalls++;
          const targetOf = (name: string) => {
            const tool = input.tools?.find(
              (candidate) => candidate.function.name === name,
            );
            const parameters = tool?.function.parameters as {
              properties?: { target?: { enum?: unknown[] } };
            };
            const modelRef = parameters.properties?.target?.enum?.[0];
            if (typeof modelRef !== "string")
              throw new Error(`missing target for ${name}`);
            return modelRef;
          };
          if (providerCalls === 1)
            return {
              content: "",
              tool_calls: [
                {
                  id: "tool-call-abcdefghijkl-1",
                  name: "propose_set_text",
                  arguments: JSON.stringify({
                    target: targetOf("propose_set_text"),
                    approval_scope: "single_step",
                    approval_reason: "값을 확인합니다.",
                  }),
                },
              ],
            };
          return {
            content: "",
            tool_calls: [
              {
                id: "tool-call-clarify-abcdef",
                name: "request_clarification",
                arguments: JSON.stringify({
                  question: "검색값을 알려주세요.",
                  value_kind: "text",
                  target: targetOf("request_clarification"),
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
              ref_id: "search-abcdefghijklmnop",
              role: "textbox",
              name: "Search query",
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
      executeApprovedProposal: async () => {
        throw new Error("must not dispatch without approval");
      },
      endSession,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Search query에 browser test를 입력해줘.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [textDefinition],
      profileDefinitions: [textDefinition],
      harnessCapabilities: {
        request_revision: 1,
        read_tools: [],
        propose_tools: ["propose_set_text"],
        entry_roles: ["textbox"],
      },
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "CLARIFICATION",
    });
    expect(providerCalls).toBe(2);
    expect(endSession).not.toHaveBeenCalled();
    expect(
      publish.mock.calls.filter(([, event]) => event.type === "value_required"),
    ).toHaveLength(1);
    expect(session.awaitingClarification?.question).toContain("검색값");
  });

  it("corrects_a_stale_value_revision_before_any_review_card", async () => {
    // F2: a text value bound to a stale revision must come back to the model
    // pre-review; the only card shown carries the corrected binding.
    const textDefinition: ProfileActionTool = {
      tool: "set_text_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["textbox"],
      verifier: {
        kind: "semantic-state-transition",
        declaration_id: "text-v1",
        pre_state_digest: "digest",
        required_changes: [],
      },
    };
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    let providerCalls = 0;
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async (input: { tools?: ProviderToolDefinition[] }) => {
          providerCalls++;
          const setText = input.tools?.find(
            (tool) => tool.function.name === "propose_set_text",
          );
          const parameters = setText?.function.parameters as {
            properties?: { target?: { enum?: unknown[] } };
          };
          const modelRef = parameters.properties?.target?.enum?.[0];
          if (typeof modelRef !== "string") throw new Error("missing target");
          return {
            content: "",
            tool_calls: [
              {
                id: `tool-call-abcdefghijkl-${providerCalls}`,
                name: "propose_set_text",
                arguments: JSON.stringify({
                  target: modelRef,
                  value: "browser test",
                  value_source_revision: providerCalls === 1 ? 2 : 1,
                  approval_scope: "single_step",
                  approval_reason: "값을 확인합니다.",
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
              ref_id: "search-abcdefghijklmnop",
              role: "textbox",
              name: "Search query",
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
      executeApprovedProposal: async () => {
        throw new Error("must not dispatch without approval");
      },
      endSession: () => undefined,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Search query에 browser test를 입력해줘.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [textDefinition],
      profileDefinitions: [textDefinition],
      harnessCapabilities: {
        request_revision: 1,
        read_tools: [],
        propose_tools: ["propose_set_text"],
        entry_roles: ["textbox"],
      },
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "ACTION_REVIEW",
    });
    expect(providerCalls).toBe(2);
    const reviews = publish.mock.calls.filter(
      ([, event]) => event.type === "action_review_required",
    );
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.[1]).toMatchObject({
      action: { suggested_value: "browser test" },
    });
  });

  it("corrects_an_option_missing_its_source_revision_before_review", async () => {
    // F2: an option value without a source revision is schema-valid but
    // unbound; the model must supply the revision before any card.
    const optionDefinition: ProfileActionTool = {
      tool: "select_option_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: ["combobox"],
      verifier: {
        kind: "semantic-state-transition",
        declaration_id: "option-v1",
        pre_state_digest: "digest",
        required_changes: [],
      },
      option_values: ["Brief", "Detailed"],
    };
    const coordinator = new ServiceCoordinator(policy);
    const publish = vi.fn();
    let providerCalls = 0;
    const runner = createActStepRunner({
      coordinator,
      provider: {
        chat: async (input: { tools?: ProviderToolDefinition[] }) => {
          providerCalls++;
          const option = input.tools?.find(
            (tool) => tool.function.name === "propose_select_option",
          );
          const parameters = option?.function.parameters as {
            properties?: { target?: { enum?: unknown[] } };
          };
          const modelRef = parameters.properties?.target?.enum?.[0];
          if (typeof modelRef !== "string") throw new Error("missing target");
          return {
            content: "",
            tool_calls: [
              {
                id: `tool-call-abcdefghijkl-${providerCalls}`,
                name: "propose_select_option",
                arguments: JSON.stringify({
                  target: modelRef,
                  value: "Detailed",
                  ...(providerCalls === 1 ? {} : { value_source_revision: 1 }),
                  approval_scope: "single_step",
                  approval_reason: "범위를 선택합니다.",
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
              ref_id: "combo-ref-abcdefghijkl",
              role: "combobox",
              name: "Report scope",
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
      executeApprovedProposal: async () => {
        throw new Error("must not dispatch without approval");
      },
      endSession: () => undefined,
    });
    const session: ActSession = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "Report scope를 Detailed로 선택해줘.",
      messages: [{ role: "system", content: "system" }],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [optionDefinition],
      profileDefinitions: [optionDefinition],
      harnessCapabilities: {
        request_revision: 1,
        read_tools: [],
        propose_tools: ["propose_select_option"],
        entry_roles: ["combobox"],
      },
    };

    await expect(runner.runStep(session)).resolves.toMatchObject({
      ok: true,
      state: "ACTION_REVIEW",
    });
    expect(providerCalls).toBe(2);
    expect(
      publish.mock.calls.filter(
        ([, event]) => event.type === "action_review_required",
      ),
    ).toHaveLength(1);
  });
});
