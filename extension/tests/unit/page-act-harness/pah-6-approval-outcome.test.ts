import { describe, expect, it } from "vitest";
import {
  consumeApproval,
  consumeStoredApproval,
  createApprovalStore,
  grantApproval,
  grantStoredApproval,
  revokeApproval,
} from "../../../src/page-act-harness/approval-store.js";
import {
  classifyOutcome,
  toLegacyOutcome,
} from "../../../src/page-act-harness/outcome.js";

// PAH-6 unit slice: approval binding/nonces and answer/action/goal
// separation. Binding preflight inputs, executor wiring, typed verifiers,
// and masking are verified in Chrome/live paths, not here (§12).
const grant = () =>
  grantApproval({
    approval_id: "approval-abcdefghijklmnop",
    plan_id: "plan-abcdefghijklmnop",
    plan_revision: 2,
    request_revision: 1,
    scope: "single_step",
  });

const expectApproval = {
  plan_id: "plan-abcdefghijklmnop",
  plan_revision: 2,
  request_revision: 1,
  binding_current: true,
};

describe("PAH-6 approval and outcomes", () => {
  it("grants_consumes_and_goal_verifies_on_the_happy_path", () => {
    const consumed = consumeApproval(grant(), expectApproval);
    expect(consumed.used).toBe(true);
    const outcome = classifyOutcome({
      tool_calls_made: true,
      read_only: false,
      actions: [
        {
          action_id: "a1",
          dispatched: true,
          observed: true,
          verifier: "satisfied",
        },
      ],
      goal: {
        required_actions: 1,
        verified_actions: 1,
        final_observation: true,
        goal_met: true,
      },
    });
    expect(outcome.kind).toBe("GOAL_VERIFIED");
    expect(toLegacyOutcome("GOAL_VERIFIED")).toBe("VERIFIED");
    expect(toLegacyOutcome("ANSWER_ONLY")).toBe("UNKNOWN");
    expect(toLegacyOutcome("INCOMPLETE")).toBe("UNKNOWN");
  });

  it("keeps_tool_less_answers_and_reads_only_runs_out_of_verified", () => {
    expect(
      classifyOutcome({ tool_calls_made: false, read_only: true, actions: [] })
        .kind,
    ).toBe("ANSWER_ONLY");
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [],
      }).kind,
    ).toBe("ANSWER_ONLY");
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "failed",
          },
        ],
      }).kind,
    ).toBe("FAILED");
  });

  it("does_not_promote_step_success_to_goal_success", () => {
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "satisfied",
          },
        ],
      }).kind,
    ).toBe("VERIFIED");
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: false,
            verifier: "pending",
          },
        ],
      }).kind,
    ).toBe("UNKNOWN");
    // Goal counts must match the satisfied actions: inflated counts stay VERIFIED.
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "satisfied",
          },
        ],
        goal: {
          required_actions: 5,
          verified_actions: 5,
          final_observation: true,
          goal_met: true,
        },
      }).kind,
    ).toBe("VERIFIED");
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "satisfied",
          },
        ],
        goal: {
          required_actions: 1,
          verified_actions: 1,
          final_observation: false,
          goal_met: true,
        },
      }).kind,
    ).toBe("VERIFIED");
  });

  it("fails_on_removed_unsupported_steps_stale_binding_and_unknown_mutation", () => {
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "satisfied",
          },
        ],
        unsupported_steps: 1,
      }).kind,
    ).toBe("FAILED");
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "satisfied",
          },
        ],
        binding_current: false,
      }).kind,
    ).toBe("UNKNOWN");
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "satisfied",
          },
        ],
        unknown_mutation: true,
      }).kind,
    ).toBe("UNKNOWN");
  });

  it("rejects_stale_targets_reused_and_revoked_approvals", () => {
    const approval = grant();
    expect(approval.value_binding).toBe("none");
    expect(() =>
      consumeApproval(approval, { ...expectApproval, binding_current: false }),
    ).toThrow("STALE_BINDING");
    expect(() =>
      consumeApproval(approval, { ...expectApproval, plan_revision: 3 }),
    ).toThrow("PLAN_REVISION_CHANGED");
    expect(() =>
      consumeApproval(approval, { ...expectApproval, request_revision: 2 }),
    ).toThrow("REQUEST_REVISION_CHANGED");
    expect(() =>
      consumeApproval(approval, {
        ...expectApproval,
        plan_id: "plan-xxxxxxxxxxxxxxx1",
      }),
    ).toThrow("PLAN_ID_MISMATCH");
    const used = consumeApproval(approval, expectApproval);
    expect(() => consumeApproval(used, expectApproval)).toThrow(
      "APPROVAL_REUSED",
    );
    const revoked = revokeApproval(grant(), "STOP");
    expect(() => consumeApproval(revoked, expectApproval)).toThrow(
      "APPROVAL_REVOKED",
    );
  });

  it("marks_budget_exhaustion_incomplete_without_hiding_failure", () => {
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "satisfied",
          },
        ],
        budget_exhausted: true,
      }).kind,
    ).toBe("INCOMPLETE");
    // Failure outranks budget: the cause is preserved, not masked.
    expect(
      classifyOutcome({
        tool_calls_made: true,
        read_only: false,
        actions: [
          {
            action_id: "a1",
            dispatched: true,
            observed: true,
            verifier: "failed",
          },
        ],
        budget_exhausted: true,
      }).kind,
    ).toBe("FAILED");
  });

  it("blocks_a_second_consume_of_the_same_stored_approval", () => {
    const store = createApprovalStore();
    const first = grantStoredApproval(store, {
      approval_id: "approval-abcdefghijklmnop",
      plan_id: "plan-abcdefghijklmnop",
      plan_revision: 2,
      request_revision: 1,
      scope: "single_step",
    });
    expect(first.used).toBe(false);
    // A stale copy of the pre-consume object must not bypass single-use.
    const staleCopy = { ...first };
    expect(
      consumeStoredApproval(store, first.approval_id, expectApproval).used,
    ).toBe(true);
    expect(() =>
      consumeStoredApproval(store, staleCopy.approval_id, expectApproval),
    ).toThrow("APPROVAL_REUSED");
    expect(() =>
      grantStoredApproval(store, {
        approval_id: "approval-abcdefghijklmnop",
        plan_id: "plan-abcdefghijklmnop",
        plan_revision: 2,
        request_revision: 1,
        scope: "single_step",
      }),
    ).toThrow("APPROVAL_ID_CONFLICT");
    expect(() =>
      consumeStoredApproval(store, "approval-xxxxxxxxxxxxxxxx", expectApproval),
    ).toThrow("APPROVAL_NOT_FOUND");
  });
});
