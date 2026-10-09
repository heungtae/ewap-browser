import { describe, expect, it, vi } from "vitest";
import type { SemanticSnapshot } from "../../../src/contracts/types.js";
import { genericActTools } from "../../../src/service-worker/act-tools.js";
import { parseActProposal } from "../../../src/service-worker/act-proposal-parser.js";
import { prepareActProposal } from "../../../src/service-worker/act-proposal-readiness.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import { createActProposalFollowup } from "../../../src/service-worker/act-proposal-followup.js";
import { createActReviewMessageHandler } from "../../../src/service-worker/act-review-message-handler.js";
import {
  parseClarificationCall,
  storeClarification,
} from "../../../src/service-worker/act-clarification.js";
import { actionView } from "../../../src/service-worker/act-review-presentation.js";
import { validateActionView } from "../../../src/contracts/chat-event-validation.js";

const policy = {
  permission_origins: ["<all_urls>"],
  page_read_origins: ["<all_urls>"],
  profile_resolver_origins: [],
  llm_egress_origins: [],
};

const textDefinition = {
  tool: "set_text_by_ref" as const,
  effect: "local-ui-only" as const,
  risk: "R1" as const,
  eligible_roles: ["textbox"] as const,
  verifier: {
    kind: "semantic-state-transition" as const,
    declaration_id: "text-v1",
    pre_state_digest: "digest",
    required_changes: [],
  },
};

const snapshot: SemanticSnapshot = {
  schema_version: 2,
  document_epoch: "epoch-abcdefghijklmnop",
  frame_id: 0,
  nodes: [
    {
      ref_id: "search-ref-abcdefghijkl",
      role: "textbox",
      name: "Search query",
      state: {},
      visible: true,
      enabled: true,
    },
  ],
  visible_text: "",
};

const modelSnapshot = {
  document_epoch: snapshot.document_epoch,
  frame_id: 0,
  nodes: snapshot.nodes.map((node, index) => ({
    ...node,
    model_ref: `model-ref-${index}-abcdefghijkl`,
  })),
  visible_text: "",
};

const resolve = () => "search-ref-abcdefghijkl";

describe("pah-9 llm input value binding", () => {
  it("offers_value_and_clarification_tools_with_the_same_target_enum", () => {
    const tools = genericActTools(
      [textDefinition as never],
      modelSnapshot,
      snapshot,
    );
    const names = tools.map((tool) => tool.function.name);
    expect(names).toContain("propose_set_text");
    expect(names).toContain("request_clarification");
    const setText = tools.find(
      (tool) => tool.function.name === "propose_set_text",
    )!;
    expect(setText.function.parameters.properties).toHaveProperty("value");
    expect(setText.function.parameters.properties).toHaveProperty(
      "value_source_revision",
    );
  });

  it("parses_an_llm_judged_value_with_its_source_revision", () => {
    const parsed = parseActProposal(
      {
        id: "call-abcdefghijklmnop",
        name: "propose_set_text",
        arguments: JSON.stringify({
          target: "model-ref-0-abcdefghijkl",
          value: "browser test",
          value_source_revision: 1,
          approval_scope: "single_step",
          approval_reason: "요청에 명확한 값이 있어 입력합니다.",
        }),
      },
      resolve as never,
      snapshot,
      [textDefinition as never],
      "page-derived",
    );
    expect(parsed.value).toBe("browser test");
    expect(parsed.valueSourceRevision).toBe(1);
  });

  it("matches_parser_requiredness_to_the_offered_schema", () => {
    // R5: the offered schema requires only target/approval_scope/
    // approval_reason for text; the parser must accept that shape and only
    // reject a lone value or a lone revision.
    const tools = genericActTools(
      [textDefinition as never],
      modelSnapshot,
      snapshot,
    );
    const setText = tools.find(
      (tool) => tool.function.name === "propose_set_text",
    )!;
    expect(setText.function.parameters.required).toEqual([
      "target",
      "approval_scope",
      "approval_reason",
    ]);
    const legacy = parseActProposal(
      {
        id: "call-abcdefghijklmnop",
        name: "propose_set_text",
        arguments: JSON.stringify({
          target: "model-ref-0-abcdefghijkl",
          approval_scope: "single_step",
          approval_reason: "기존 경로를 확인합니다.",
        }),
      },
      resolve as never,
      snapshot,
      [textDefinition as never],
      "page-derived",
    );
    expect(legacy.value).toBeUndefined();
    expect(legacy.valueSourceRevision).toBeUndefined();
    expect(() =>
      parseActProposal(
        {
          id: "call-abcdefghijklmnop",
          name: "propose_set_text",
          arguments: JSON.stringify({
            target: "model-ref-0-abcdefghijkl",
            value_source_revision: 1,
            approval_scope: "single_step",
            approval_reason: "값이 있습니다.",
          }),
        },
        resolve as never,
        snapshot,
        [textDefinition as never],
        "page-derived",
      ),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("keeps_option_source_revision_optional_in_parser_but_binding_in_harness", () => {
    // R5: an option call without value_source_revision is schema-valid and
    // parses, but a harness-bound execution still demands the revision.
    const optionDefinition = {
      tool: "select_option_by_ref" as const,
      effect: "local-ui-only" as const,
      risk: "R1" as const,
      eligible_roles: ["combobox"] as const,
      verifier: {
        kind: "semantic-state-transition" as const,
        declaration_id: "option-v1",
        pre_state_digest: "digest",
        required_changes: [],
      },
      option_values: ["Brief", "Detailed"],
    };
    const comboSnapshot: SemanticSnapshot = {
      ...snapshot,
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
    };
    const parsed = parseActProposal(
      {
        id: "call-abcdefghijklmnop",
        name: "propose_select_option",
        arguments: JSON.stringify({
          target: "model-ref-0-abcdefghijkl",
          value: "Detailed",
          approval_scope: "single_step",
          approval_reason: "범위를 선택합니다.",
        }),
      },
      () => "combo-ref-abcdefghijkl",
      comboSnapshot,
      [optionDefinition as never],
      "profile",
    );
    expect(parsed.value).toBe("Detailed");
    expect(parsed.valueSourceRevision).toBeUndefined();
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const published = vi.fn();
    const harness = prepareActProposal(
      { coordinator, actionView: () => ({}) as never, publish: published },
      { id: "s", profile: { id: "p", version: 1 } } as ActSession,
      run,
      { ...parsed, definition: optionDefinition as never },
      {
        ref_id: "combo-ref-abcdefghijkl",
        role: "combobox",
        name: "Report scope",
        enabled: true,
        visible: true,
        state: {},
      },
      1,
    );
    expect(harness).toEqual({
      response: { ok: false, code: "VALUE_BINDING_INVALID" },
    });
    expect(
      published.mock.calls.some(([, event]) => event.type === "value_required"),
    ).toBe(false);
  });

  it("rejects_value_without_source_and_sensitive_targets", () => {
    expect(() =>
      parseActProposal(
        {
          id: "call-abcdefghijklmnop",
          name: "propose_set_text",
          arguments: JSON.stringify({
            target: "model-ref-0-abcdefghijkl",
            value: "browser test",
            approval_scope: "single_step",
            approval_reason: "값이 있습니다.",
          }),
        },
        resolve as never,
        snapshot,
        [textDefinition as never],
        "page-derived",
      ),
    ).toThrow("INVALID_ARGUMENT");
    const sensitive: SemanticSnapshot = {
      ...snapshot,
      nodes: [
        {
          ref_id: "pw-ref-abcdefghijklm",
          role: "textbox",
          name: "Account password",
          state: {},
          visible: true,
          enabled: true,
        },
      ],
    };
    expect(() =>
      parseActProposal(
        {
          id: "call-abcdefghijklmnop",
          name: "propose_set_text",
          arguments: JSON.stringify({
            target: "model-ref-0-abcdefghijkl",
            value: "secret",
            value_source_revision: 1,
            approval_scope: "single_step",
            approval_reason: "값이 있습니다.",
          }),
        },
        () => "pw-ref-abcdefghijklm",
        sensitive,
        [textDefinition as never],
        "page-derived",
      ),
    ).toThrow("TARGET_NOT_ACTIONABLE");
  });

  it("binds_a_clear_value_without_an_extra_value_card", () => {
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const proposal = {
      id: "proposal-abcdefghijkl",
      tool: "set_text_by_ref" as const,
      refId: "search-ref-abcdefghijkl",
      targetName: "Search query",
      approvalScope: "single_step" as const,
      approvalReason: "요청에 명확한 값이 있어 입력합니다.",
      value: "browser test",
      valueSourceRevision: 1,
      toolCallId: "tool-call-abcdefghijkl",
      definition: textDefinition as never,
    };
    const session = {
      id: "session-abcdefghijkl",
      profile: { id: "profile", version: 1 },
    } as ActSession;
    const published = vi.fn();
    const prepared = prepareActProposal(
      { coordinator, actionView: () => ({}) as never, publish: published },
      session,
      run,
      proposal,
      {
        ref_id: proposal.refId,
        role: "textbox",
        name: "Search query",
        enabled: true,
        visible: true,
        state: {},
      },
      1,
    );
    expect("ready" in prepared).toBe(true);
    expect(
      published.mock.calls.some(([, event]) => event.type === "value_required"),
    ).toBe(false);
    expect(session.awaitingValue).toBeUndefined();
  });

  it("returns_missing_or_stale_values_as_contract_errors_never_a_card", () => {
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const legacy: Parameters<typeof prepareActProposal>[3] = {
      id: "proposal-abcdefghijkl",
      tool: "set_text_by_ref",
      refId: "search-ref-abcdefghijkl",
      targetName: "Search query",
      approvalScope: "single_step",
      approvalReason: "값 없이 제안합니다.",
      toolCallId: "tool-call-abcdefghijkl",
      definition: textDefinition as never,
    };
    const published = vi.fn();
    const missing = prepareActProposal(
      { coordinator, actionView: () => ({}) as never, publish: published },
      { id: "s", profile: { id: "p", version: 1 } } as ActSession,
      run,
      legacy,
      {
        ref_id: legacy.refId,
        role: "textbox",
        name: "Search query",
        enabled: true,
        visible: true,
        state: {},
      },
      1,
    );
    expect(missing).toEqual({
      response: { ok: false, code: "VALUE_BINDING_INVALID" },
    });
    const stale = prepareActProposal(
      { coordinator, actionView: () => ({}) as never, publish: published },
      { id: "s", profile: { id: "p", version: 1 } } as ActSession,
      coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act"),
      { ...legacy, value: "browser test", valueSourceRevision: 2 },
      {
        ref_id: legacy.refId,
        role: "textbox",
        name: "Search query",
        enabled: true,
        visible: true,
        state: {},
      },
      1,
    );
    expect(stale).toEqual({
      response: { ok: false, code: "VALUE_BINDING_INVALID" },
    });
    expect(
      published.mock.calls.some(([, event]) => event.type === "value_required"),
    ).toBe(false);
  });

  it("keeps_the_legacy_target_only_card_only_without_a_harness_revision", () => {
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const legacy = {
      id: "proposal-abcdefghijkl",
      tool: "set_text_by_ref" as const,
      refId: "search-ref-abcdefghijkl",
      targetName: "Search query",
      approvalScope: "single_step" as const,
      approvalReason: "기존 경로를 확인합니다.",
      toolCallId: "tool-call-abcdefghijkl",
      definition: textDefinition as never,
    };
    const session = {
      id: "session-abcdefghijkl",
      profile: { id: "profile", version: 1 },
    } as ActSession;
    const published = vi.fn();
    const prepared = prepareActProposal(
      { coordinator, actionView: () => ({}) as never, publish: published },
      session,
      run,
      legacy,
      {
        ref_id: legacy.refId,
        role: "textbox",
        name: "Search query",
        enabled: true,
        visible: true,
        state: {},
      },
    );
    expect(prepared).toMatchObject({
      response: { ok: true, state: "VALUE_REQUIRED" },
    });
    expect(session.awaitingValue?.valueKind).toBe("text");
  });

  it("asks_via_clarification_and_continues_the_same_conversation", async () => {
    const parsed = parseClarificationCall({
      call: {
        id: "call-clarify-abcdefgh",
        name: "request_clarification",
        arguments: JSON.stringify({
          question: "검색값을 알려주세요.",
          value_kind: "text",
          target: "model-ref-0-abcdefghijkl",
        }),
      },
      resolve: () => "search-ref-abcdefghijkl",
      snapshot,
      expectedRevision: 1,
    });
    expect(parsed.question).toContain("검색값");
    const session = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "검색을 하고 싶어.",
      messages: [],
      profile: { id: "profile", version: 1 },
      discovery: "page-derived",
      definitions: [],
      profileDefinitions: [],
      harnessCapabilities: {
        request_revision: 1,
        read_tools: [],
        propose_tools: ["propose_set_text"],
        entry_roles: ["textbox"],
      },
    } as unknown as ActSession;
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    storeClarification(session, run.id, parsed);
    expect(session.awaitingClarification?.clarificationId).toBe(
      parsed.clarificationId,
    );
    const continued = vi.fn(async () => ({ ok: true, state: "ACTION_REVIEW" }));
    const followup = createActProposalFollowup({
      coordinator,
      authorizeEnterprise: async () => ({
        decision: "ALLOW" as const,
        managed_auto: false,
      }),
      getRun: (runId) => coordinator.runs.byId(runId),
      execute: async () => ({ ok: true }),
      complete: async () => ({ ok: true }),
      continueAfterClarification: continued,
    });
    await expect(
      followup.submitValue(session, "browser test"),
    ).resolves.toMatchObject({ ok: true });
    expect(session.awaitingClarification).toBeUndefined();
    expect(continued).toHaveBeenCalledTimes(1);
    expect(
      session.messages.some(
        (message) =>
          message.role === "tool" && message.tool_call_id === parsed.toolCallId,
      ),
    ).toBe(true);
    // Single-use: a repeated answer never re-enters the loop.
    await expect(followup.submitValue(session, "browser test")).rejects.toThrow(
      "VALUE_BINDING_INVALID",
    );
  });

  it("discards_clarification_on_stop_or_terminal_without_reuse", async () => {
    const makeSession = (runId: string) =>
      ({
        id: "session-abcdefghijkl",
        tabId: 1,
        origin: "https://portal.company.test",
        prompt: "검색을 하고 싶어.",
        messages: [],
        profile: { id: "profile", version: 1 },
        awaitingClarification: {
          runId,
          clarificationId: "clarify-abcdefghijkl",
          question: "검색값을 알려주세요.",
          valueKind: "text",
          requestRevision: 1,
          toolCallId: "call-clarify-abcdefgh",
        },
        requestContext: { signal: { aborted: true } },
      }) as unknown as ActSession;
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const followup = createActProposalFollowup({
      coordinator,
      authorizeEnterprise: async () => ({
        decision: "ALLOW" as const,
        managed_auto: false,
      }),
      getRun: (runId) => coordinator.runs.byId(runId),
      execute: async () => ({ ok: true }),
      complete: async () => ({ ok: true }),
    });
    const stopped = makeSession(run.id);
    await expect(followup.submitValue(stopped, "browser test")).rejects.toThrow(
      "POLICY_DENIED",
    );
    expect(stopped.awaitingClarification).toBeUndefined();
    // Terminal runs never reuse a pending clarification either.
    const run2 = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    coordinator.runs.terminal(run2.id, "FAILED", "POLICY_DENIED");
    const terminated = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin: "https://portal.company.test",
      prompt: "검색을 하고 싶어.",
      messages: [],
      profile: { id: "profile", version: 1 },
      awaitingClarification: {
        runId: run2.id,
        clarificationId: "clarify-abcdefghijkl",
        question: "검색값을 알려주세요.",
        valueKind: "text",
        requestRevision: 1,
        toolCallId: "call-clarify-abcdefgh",
      },
    } as unknown as ActSession;
    await expect(
      followup.submitValue(terminated, "browser test"),
    ).rejects.toThrow("VALUE_BINDING_INVALID");
    expect(terminated.awaitingClarification).toBeUndefined();
  });

  it("accepts_clarification_answers_through_the_value_card_channel", () => {
    const session = {
      proposal: undefined,
      awaitingClarification: { clarificationId: "clarify-abcdefghijkl" },
    };
    const handler = createActReviewMessageHandler({
      isPanelSender: () => true,
      session: () => session as never,
      reject: () => undefined,
      submitValue: async () => ({ ok: true }),
      confirm: async () => ({ ok: true }),
      approve: async () => ({ ok: true }),
      safeFailure: (code) => ({ ok: false, code }),
    });
    const responded: unknown[] = [];
    const result = handler.handle(
      {
        kind: "ACT_VALUE_SUBMIT",
        session_id: "session-abcdefghijkl",
        proposal_id: "clarify-abcdefghijkl",
        value: "browser test",
      },
      {},
      (response) => responded.push(response),
    );
    expect(result.handled).toBe(true);
  });

  it("preserves_full_review_values_including_middle_changes", () => {
    const viewFor = (value: string) =>
      actionView(
        { id: "session-abcdefghijkl", origin: "https://portal.company.test" },
        {
          id: "proposal-abcdefghijkl",
          tool: "propose_set_text",
          targetName: "Search query",
          approvalScope: "single_step",
          approvalReason: "요청에 명확한 값이 있어 입력합니다.",
          value,
        },
      );
    const firstValue = `${"x".repeat(512)}middle A${"z".repeat(584)}`;
    const secondValue = `${"x".repeat(512)}middle B${"z".repeat(584)}`;
    const first = viewFor(firstValue);
    const second = viewFor(secondValue);
    expect(first.suggested_value).toBe(firstValue);
    expect(second.suggested_value).toBe(secondValue);
    expect(validateActionView(first).suggested_value).toBe(firstValue);
    expect(validateActionView(second).suggested_value).toBe(secondValue);
    expect(validateActionView(viewFor("😀".repeat(4096))).suggested_value).toBe(
      "😀".repeat(4096),
    );
    expect(first.suggested_value_truncated).toBeUndefined();
    const short = viewFor("browser test");
    expect(short.suggested_value).toBe("browser test");
    expect(short.suggested_value_length).toBe(12);
    expect(short.suggested_value_truncated).toBeUndefined();
    expect(short.suggested_value_tail).toBeUndefined();
    expect(short.suggested_value_digest).toBeUndefined();
  });
});
