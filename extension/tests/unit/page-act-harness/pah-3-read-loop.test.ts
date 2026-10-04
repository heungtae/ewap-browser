import { describe, expect, it } from "vitest";
import {
  READ_LOOP_GUIDANCE,
  checkBudget,
  classifyTurn,
  orderReads,
  validateToolCallBinding,
} from "../../../src/page-act-harness/read-loop.js";
import {
  needsContextFor,
  validateSubmitPlan,
} from "../../../src/page-act-harness/plan-contract.js";

// PAH-3 contract/unit scope: turn classification, call binding, batching,
// plan schema/capability checks, budget exhaustion. Live model selection
// is verified with a live provider + Chrome, not here (§12).
const call = (
  id: string,
  name: string,
  args: Record<string, unknown> = {},
) => ({
  tool_call_id: id,
  name,
  arguments: args,
});

describe("PAH-3 read loop and plan contract", () => {
  it("chains_inventory_read_result_additional_read_into_a_plan", () => {
    const seen = new Set<string>();
    const inventory = {
      turn_id: "turn-abcdefghijklmnop",
      request_revision: 1,
      tool_calls: [call("call-abcdefghijklmnop", "list_page_resources")],
    };
    expect(classifyTurn(inventory)).toBe("READ_REQUEST");
    validateToolCallBinding(inventory, seen, 1);
    const followup = {
      turn_id: "turn-bcdefghijklmnopq",
      request_revision: 1,
      tool_calls: [
        call("call-bcdefghijklmnopq", "read_page_resource", {
          resource_id: "section-abcdefghijklm",
        }),
      ],
    };
    expect(classifyTurn(followup)).toBe("READ_REQUEST");
    validateToolCallBinding(followup, seen, 1);
    const plan = validateSubmitPlan(
      {
        plan_id: "plan-abcdefghijklmnop",
        request_revision: 1,
        goal: "Search query에 browser test 입력",
        evidence_ids: ["ev-read-abcdefghijklmnop", "ev-ui-abcdefghijklmnop"],
        coverage_note: "visible synopsis + section chunk",
        provenance: "page-generated",
        steps: [
          {
            intent: "type browser test into Search query",
            target_evidence_id: "ev-ui-abcdefghijklmnop",
            capability: "propose_set_text",
            postcondition: "textbox value observed",
          },
        ],
        approval_scope: "single_step",
      },
      ["propose_set_text", "read_page"],
      1,
    );
    expect(plan.steps.length).toBe(1);
  });

  it("rejects_empty_and_mixed_turns_as_protocol_failures", () => {
    expect(() =>
      classifyTurn({
        turn_id: "turn-abcdefghijklmnop",
        request_revision: 1,
        tool_calls: [],
      }),
    ).toThrow("PROTOCOL_EMPTY_TURN");
    expect(
      classifyTurn({
        turn_id: "turn-abcdefghijklmnop",
        request_revision: 1,
        tool_calls: [],
        content: "done",
      }),
    ).toBe("FINAL_RESPONSE");
    expect(() =>
      classifyTurn({
        turn_id: "turn-abcdefghijklmnop",
        request_revision: 1,
        tool_calls: [
          call("call-aaaaaaaaaaaaaaaa", "read_page"),
          call("call-bbbbbbbbbbbbbbbb", "propose_set_text"),
        ],
      }),
    ).toThrow("PROTOCOL_MIXED_TURN");
  });

  it("rejects_completion_claims_over_unread_material", () => {
    expect(
      needsContextFor(["ev-missing-abcdefghijk"], ["ev-read-abcdefghijklmnop"]),
    ).toEqual({
      verdict: "needs_context",
      missing: ["ev-missing-abcdefghijk"],
    });
    expect(() =>
      validateSubmitPlan(
        {
          plan_id: "plan-abcdefghijklmnop",
          request_revision: 1,
          goal: "g",
          evidence_ids: [],
          coverage_note: "none",
          provenance: "page-generated",
          steps: [
            {
              intent: "i",
              capability: "propose_set_text",
              postcondition: "p",
            },
          ],
          approval_scope: "single_step",
        },
        ["propose_set_text"],
        1,
      ),
    ).toThrow("EVIDENCE_REQUIRED");
  });

  it("treats_unknown_denied_and_unsupported_as_alternatives_not_success", () => {
    expect(() =>
      classifyTurn({
        turn_id: "turn-abcdefghijklmnop",
        request_revision: 1,
        tool_calls: [call("call-abcdefghijklmnop", "invoke_arbitrary_js")],
      }),
    ).toThrow("UNSUPPORTED_TOOL");
    expect(
      checkBudget({ max_turns: 5, max_reads: 5, used_turns: 5, used_reads: 1 })
        .state,
    ).toBe("INCOMPLETE");
    expect(
      checkBudget({ max_turns: 5, max_reads: 5, used_turns: 1, used_reads: 5 })
        .state,
    ).toBe("INCOMPLETE");
    expect(
      checkBudget({ max_turns: 5, max_reads: 5, used_turns: 1, used_reads: 1 })
        .state,
    ).toBe("OK");
  });

  it("keeps_the_input_goal_when_a_preview_step_is_offered", () => {
    // A Preview step proposal is an ACTION_PROPOSAL against the original
    // goal; switching goals requires an actual user response (clarification
    // turn), never an automatic rewrite here.
    const proposal = {
      turn_id: "turn-abcdefghijklmnop",
      request_revision: 1,
      tool_calls: [call("call-abcdefghijklmnop", "propose_set_text")],
    };
    expect(classifyTurn(proposal)).toBe("ACTION_PROPOSAL");
    const clarification = {
      turn_id: "turn-bcdefghijklmnopq",
      request_revision: 1,
      tool_calls: [call("call-bcdefghijklmnopq", "request_clarification")],
    };
    expect(classifyTurn(clarification)).toBe("CLARIFICATION");
  });

  it("rejects_duplicate_and_stale_tool_calls_and_orders_dependent_reads", () => {
    const seen = new Set<string>(["call-abcdefghijklmnop"]);
    expect(() =>
      validateToolCallBinding(
        {
          turn_id: "turn-abcdefghijklmnop",
          request_revision: 2,
          tool_calls: [call("call-xyz-abcdefghijklm", "read_page")],
        },
        seen,
        1,
      ),
    ).toThrow("STALE_REQUEST_REVISION");
    expect(() =>
      validateToolCallBinding(
        {
          turn_id: "turn-abcdefghijklmnop",
          request_revision: 1,
          tool_calls: [call("call-abcdefghijklmnop", "read_page")],
        },
        seen,
        1,
      ),
    ).toThrow("DUPLICATE_TOOL_CALL");
    const independent = orderReads([
      call("call-aaaaaaaaaaaaaaaa", "read_page"),
      call("call-bbbbbbbbbbbbbbbb", "find", { query: "x" }),
    ]);
    expect(independent.sequential).toBe(false);
    const withCursor = orderReads([
      call("call-aaaaaaaaaaaaaaaa", "read_page_resource", {
        resource_id: "section-abcdefghijklm",
        cursor: "offset:200",
      }),
      call("call-bbbbbbbbbbbbbbbb", "find", { query: "x" }),
    ]);
    expect(withCursor.sequential).toBe(true);
    expect(() =>
      orderReads([
        call("call-aaaaaaaaaaaaaaaa", "read_page"),
        call("call-bbbbbbbbbbbbbbbb", "propose_set_text"),
      ]),
    ).toThrow("NON_READ_BATCHED");
    expect(() =>
      validateSubmitPlan(
        {
          plan_id: "plan-abcdefghijklmnop",
          request_revision: 1,
          goal: "g",
          evidence_ids: ["ev-read-abcdefghijklmnop"],
          coverage_note: "c",
          provenance: "p",
          steps: [
            {
              intent: "i",
              capability: "call_arbitrary_endpoint",
              postcondition: "p",
            },
          ],
          approval_scope: "single_step",
        },
        ["propose_set_text"],
        1,
      ),
    ).toThrow("UNSUPPORTED_STEP");
    expect(() =>
      validateSubmitPlan(
        {
          plan_id: "plan-abcdefghijklmnop",
          request_revision: 1,
          goal: "g",
          evidence_ids: ["ev-read-abcdefghijklmnop"],
          coverage_note: "c",
          provenance: "p",
          steps: [
            {
              intent: "i",
              target_evidence_id: "ev-dangling-abcdefghijk",
              capability: "propose_set_text",
              postcondition: "p",
            },
          ],
          approval_scope: "single_step",
        },
        ["propose_set_text"],
        1,
      ),
    ).toThrow("TARGET_EVIDENCE_DANGLING");
    expect(READ_LOOP_GUIDANCE).toContain(
      "without a resource id, list the inventory first",
    );
    expect(READ_LOOP_GUIDANCE).toContain(
      "A response without tool calls is never",
    );
  });

  it("rejects_a_repeated_tool_call_id_inside_one_turn", () => {
    const seen = new Set<string>();
    expect(() =>
      validateToolCallBinding(
        {
          turn_id: "turn-abcdefghijklmnop",
          request_revision: 1,
          tool_calls: [
            call("call-aaaaaaaaaaaaaaaa", "read_page"),
            call("call-aaaaaaaaaaaaaaaa", "find", { query: "x" }),
          ],
        },
        seen,
        1,
      ),
    ).toThrow("DUPLICATE_TOOL_CALL");
    // Atomic: the failed turn commits nothing, so a later turn reusing one
    // of its ids still binds cleanly.
    validateToolCallBinding(
      {
        turn_id: "turn-bcdefghijklmnopq",
        request_revision: 1,
        tool_calls: [call("call-aaaaaaaaaaaaaaaa", "read_page")],
      },
      seen,
      1,
    );
    expect(seen.has("call-aaaaaaaaaaaaaaaa")).toBe(true);
  });
});
