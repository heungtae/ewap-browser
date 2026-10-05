import { describe, expect, it } from "vitest";
import type {
  ProviderMessage,
  ProviderToolDefinition,
} from "../../../src/providers/types.js";
import {
  actHarnessReadTools,
  parseReviewSubmit,
  runHarnessReadTurns,
  runSuitabilityReview,
  runWorkflowReviewGate,
} from "../../../src/service-worker/act-harness-turns.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import {
  consumeStoredApproval,
  getHarnessApprovalStore,
  grantStoredApproval,
} from "../../../src/page-act-harness/approval-store.js";

type ScriptedTurn = {
  content: string;
  tool_calls: Array<{ id: string; name: string; arguments: string }>;
};

const scriptedChat = (turns: ScriptedTurn[]) => {
  let index = 0;
  return async (
    _messages: ProviderMessage[],
    _tools: ProviderToolDefinition[],
  ): Promise<ScriptedTurn> => {
    const turn = turns[Math.min(index, turns.length - 1)];
    index += 1;
    if (!turn) throw new Error("OUT_OF_SCRIPTED_TURNS");
    return { content: turn.content, tool_calls: [...turn.tool_calls] };
  };
};

const readCall = (id: string) => ({
  id,
  name: "read_page",
  arguments: "{}",
});

const reviewCall = (id: string, verdict: string) => ({
  id,
  name: "submit_review",
  arguments: JSON.stringify({
    verdict,
    rationale: "scripted rationale",
    missing: [],
  }),
});

const baseSession = (): ActSession => ({
  id: "session-abcdefghijkl",
  tabId: 7,
  origin: "https://app.test",
  prompt: "Search query에 browser test를 입력해줘.",
  messages: [{ role: "system", content: "system" }],
  profile: { id: "profile", version: 1 },
  discovery: "page-derived",
  definitions: [],
  profileDefinitions: [],
  workflow: {
    declaration: {
      schema_version: 1,
      id: "preview-v1",
      title: "Preview",
      steps: [
        {
          id: "step-aaaaaaaaaaaaaa1",
          tool: "click_by_ref",
          target: { role: "button", name: "Generate preview" },
        },
      ],
    },
    step: {
      id: "step-aaaaaaaaaaaaaa1",
      tool: "click_by_ref",
      target: { role: "button", name: "Generate preview" },
    },
    count: 0,
  },
  harnessReview: {
    candidate_id: "candidate-aaaaaaaaaaaaa1",
    source: "saved",
    request_revision: 1,
    catalog_status: "verified",
    stored_scope: { origin: "https://app.test", path: "/items" },
    current_origin: "https://app.test",
    approval_id: "approval-gate-aaaaaaaaaa",
    status: "PENDING_REVIEW",
  },
});

const PROJECTION =
  "[UNTRUSTED_PAGE_PROJECTION]\ntextbox Search query\n[/UNTRUSTED_PAGE_PROJECTION]";

describe("act harness turns", () => {
  it("grounds_reads_then_returns_the_final_answer", async () => {
    const executed: string[] = [];
    const result = await runHarnessReadTurns({
      chat: scriptedChat([
        { content: "", tool_calls: [readCall("call-aaaaaaaaaaaaaaaa")] },
        { content: "grounded answer", tool_calls: [] },
      ]),
      messages: [{ role: "user", content: "go" }],
      offeredTools: [],
      readNames: ["read_page"],
      executeRead: async (call) => {
        executed.push(call.name);
        return { nodes: 1 };
      },
      serialise: JSON.stringify,
      expectedRevision: 1,
      maxRounds: 3,
    });
    expect(executed).toEqual(["read_page"]);
    expect(result.reads).toBe(1);
    expect(result.calls).toEqual([]);
    expect(result.exhausted).toBe(false);
    expect(
      result.messages.some(
        (message) =>
          message.role === "tool" &&
          message.content.includes("UNTRUSTED_TOOL_RESULT"),
      ),
    ).toBe(true);
  });

  it("rejects_duplicates_across_turns_and_stops_loudly_on_budget", async () => {
    await expect(
      runHarnessReadTurns({
        chat: scriptedChat([
          { content: "", tool_calls: [readCall("call-aaaaaaaaaaaaaaaa")] },
          { content: "", tool_calls: [readCall("call-aaaaaaaaaaaaaaaa")] },
        ]),
        messages: [{ role: "user", content: "go" }],
        offeredTools: [],
        readNames: ["read_page"],
        executeRead: async () => ({}),
        serialise: JSON.stringify,
        expectedRevision: 1,
      }),
    ).rejects.toThrow("DUPLICATE_TOOL_CALL");
    const exhausted = await runHarnessReadTurns({
      chat: scriptedChat([
        { content: "", tool_calls: [readCall("call-bbbbbbbbbbbbbbbb")] },
      ]),
      messages: [{ role: "user", content: "go" }],
      offeredTools: [],
      readNames: ["read_page"],
      executeRead: async () => ({}),
      serialise: JSON.stringify,
      expectedRevision: 1,
      maxRounds: 1,
    });
    expect(exhausted.exhausted).toBe(true);
    expect(exhausted.calls).toEqual([]);
  });

  it("parses_structured_review_verdicts_and_rejects_malformed_ones", () => {
    expect(
      parseReviewSubmit({
        name: "submit_review",
        arguments: JSON.stringify({
          verdict: "mismatch",
          rationale: "report scope is unrelated to search input",
          missing: ["script"],
        }),
      }),
    ).toEqual({
      verdict: "mismatch",
      rationale: "report scope is unrelated to search input",
      missing: ["script"],
    });
    expect(() =>
      parseReviewSubmit({ name: "propose_click", arguments: "{}" }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      parseReviewSubmit({
        name: "submit_review",
        arguments: JSON.stringify({ verdict: "maybe", rationale: "x" }),
      }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      parseReviewSubmit({
        name: "submit_review",
        arguments: JSON.stringify({ verdict: "match", rationale: "  " }),
      }),
    ).toThrow("INVALID_ARGUMENT");
  });

  it("reviews_mismatch_after_a_read_and_needs_context_without_a_verdict", async () => {
    const readPageTool = {
      type: "function" as const,
      function: { name: "read_page", description: "r", parameters: {} },
    };
    const mismatch = await runSuitabilityReview({
      chat: scriptedChat([
        { content: "", tool_calls: [readCall("call-aaaaaaaaaaaaaaaa")] },
        {
          content: "",
          tool_calls: [reviewCall("call-bbbbbbbbbbbbbbbb", "mismatch")],
        },
      ]),
      requestText: "Search query에 browser test를 입력해줘.",
      candidateSummary: "candidate preview",
      projection: PROJECTION,
      serialise: JSON.stringify,
      readTools: [readPageTool],
      executeRead: async () => ({ text: "scope options" }),
      expectedRevision: 1,
    });
    expect(mismatch.verdict).toBe("mismatch");
    const open = await runSuitabilityReview({
      chat: scriptedChat([{ content: "unsure", tool_calls: [] }]),
      requestText: "Search query에 browser test를 입력해줘.",
      candidateSummary: "candidate preview",
      projection: PROJECTION,
      serialise: JSON.stringify,
      readTools: [],
      executeRead: async () => {
        throw new Error("must not be called");
      },
      expectedRevision: 1,
    });
    expect(open.verdict).toBe("needs_context");
  });

  it("needs_context_on_duplicate_review_submissions", async () => {
    const verdict = await runSuitabilityReview({
      chat: scriptedChat([
        {
          content: "",
          tool_calls: [
            reviewCall("call-aaaaaaaaaaaaaaaa", "match"),
            reviewCall("call-bbbbbbbbbbbbbbbb", "mismatch"),
          ],
        },
      ]),
      requestText: "Search query에 browser test를 입력해줘.",
      candidateSummary: "candidate preview",
      projection: PROJECTION,
      serialise: JSON.stringify,
      readTools: [],
      executeRead: async () => {
        throw new Error("must not be called");
      },
      expectedRevision: 1,
    });
    expect(verdict.verdict).toBe("needs_context");
  });

  it("clarifies_when_the_recorded_review_is_not_executable", async () => {
    const session = {
      ...baseSession(),
      harnessReview: {
        ...baseSession().harnessReview!,
        stored_scope: { origin: "https://other.test", path: "/items" },
        current_origin: "https://app.test",
      },
    };
    const gate = await runWorkflowReviewGate({
      chat: scriptedChat([
        {
          content: "",
          tool_calls: [reviewCall("call-aaaaaaaaaaaaaaaa", "match")],
        },
      ]),
      session,
      projection: PROJECTION,
      serialise: JSON.stringify,
      readTools: [],
      executeRead: async () => {
        throw new Error("must not be called");
      },
      expectedRevision: 1,
      runId: "run-dcdefghijklmnopq",
      publishDelta: () => undefined,
    });
    expect(gate.proceed).toBe(false);
    expect(session.harnessReview?.verdict).toBe("match");
  });

  it("clarifies_on_mismatch_without_dispatching", async () => {
    const session = baseSession();
    const published: string[] = [];
    const gate = await runWorkflowReviewGate({
      chat: scriptedChat([
        {
          content: "",
          tool_calls: [reviewCall("call-aaaaaaaaaaaaaaaa", "mismatch")],
        },
      ]),
      session,
      projection: PROJECTION,
      serialise: JSON.stringify,
      readTools: [],
      executeRead: async () => {
        throw new Error("must not be called");
      },
      expectedRevision: 1,
      runId: "run-abcdefghijklmnop",
      publishDelta: (text) => published.push(text),
    });
    expect(gate.proceed).toBe(false);
    if (!gate.proceed) expect(gate.message).toContain("맞지 않습니다");
    expect(session.harnessReview?.status).toBe("REVIEWED");
    expect(session.harnessReview?.verdict).toBe("mismatch");
  });

  it("proceeds_on_match_after_consuming_the_single_use_approval", async () => {
    const session = {
      ...baseSession(),
      harnessReview: {
        ...baseSession().harnessReview!,
        approval_id: "approval-gate-match-aaaa",
      },
    };
    const published: string[] = [];
    const gate = await runWorkflowReviewGate({
      chat: scriptedChat([
        {
          content: "",
          tool_calls: [reviewCall("call-aaaaaaaaaaaaaaaa", "match")],
        },
      ]),
      session,
      projection: PROJECTION,
      serialise: JSON.stringify,
      readTools: [],
      executeRead: async () => {
        throw new Error("must not be called");
      },
      expectedRevision: 1,
      runId: "run-bcdefghijklmnopq",
      publishDelta: (text) => published.push(text),
    });
    expect(gate.proceed).toBe(true);
    expect(session.harnessReview?.verdict).toBe("match");
    // Single-use: the same approval cannot pass a second review.
    expect(() =>
      consumeStoredApproval(
        getHarnessApprovalStore(),
        "approval-gate-match-aaaa",
        {
          plan_id: "candidate-aaaaaaaaaaaaa1",
          plan_revision: 0,
          request_revision: 1,
          binding_current: true,
        },
      ),
    ).toThrow("APPROVAL_REUSED");
  });

  it("clarifies_when_the_review_approval_is_already_spent", async () => {
    // A prior gate pass spent this approval id: the grant collides, so the
    // second pass clarifies instead of double-dispatching.
    grantStoredApproval(getHarnessApprovalStore(), {
      approval_id: "approval-gate-spent-aaaa",
      plan_id: "candidate-aaaaaaaaaaaaa1",
      plan_revision: 0,
      request_revision: 1,
      scope: "workflow-review",
    });
    const session = {
      ...baseSession(),
      harnessReview: {
        ...baseSession().harnessReview!,
        approval_id: "approval-gate-spent-aaaa",
      },
    };
    const gate = await runWorkflowReviewGate({
      chat: scriptedChat([
        {
          content: "",
          tool_calls: [reviewCall("call-aaaaaaaaaaaaaaaa", "match")],
        },
      ]),
      session,
      projection: PROJECTION,
      serialise: JSON.stringify,
      readTools: [],
      executeRead: async () => {
        throw new Error("must not be called");
      },
      expectedRevision: 1,
      runId: "run-cdefghijklmnopqr",
      publishDelta: () => undefined,
    });
    expect(gate.proceed).toBe(false);
  });

  it("proceeds_on_generation_zero_by_normalizing_to_revision_one", async () => {
    // Product requests start at generation 0 (accepted, not yet running)
    // while harness revisions start at 1. The gate normalizes, so a real
    // accepted-state request records and passes like revision 1.
    const session = {
      ...baseSession(),
      harnessReview: {
        ...baseSession().harnessReview!,
        approval_id: "approval-gate-genzero-aa",
      },
    };
    const gate = await runWorkflowReviewGate({
      chat: scriptedChat([
        {
          content: "",
          tool_calls: [reviewCall("call-aaaaaaaaaaaaaaaa", "match")],
        },
      ]),
      session,
      projection: PROJECTION,
      serialise: JSON.stringify,
      readTools: [],
      executeRead: async () => {
        throw new Error("must not be called");
      },
      expectedRevision: 0,
      runId: "run-dcdefghijklmnopq",
      publishDelta: () => undefined,
    });
    expect(gate.proceed).toBe(true);
    expect(session.harnessReview?.verdict).toBe("match");
  });

  it("offers_the_ask_read_schemas_for_act_reads", () => {
    expect(actHarnessReadTools().map((tool) => tool.function.name)).toEqual([
      "read_semantic_projection",
      "read_page",
      "get_page_text",
      "find",
    ]);
  });
});
