import { describe, expect, it } from "vitest";
import {
  compactContext,
  handleFault,
} from "../../../src/page-act-harness/recovery.js";
import { buildDiagnosticBundle } from "../../../src/page-act-harness/diagnostics.js";

// PAH-7 unit slice: fault handling, compaction boundaries, and diagnostic
// classification. Multi-step restart and Chrome fault injection remain
// NOT_VERIFIED here and need live provider + Chrome evidence (§12).
describe("PAH-7 recovery and diagnostics", () => {
  it("records_unknown_actions_without_retry_after_a_worker_restart", () => {
    const outcome = handleFault("WORKER_RESTART", ["cursor:200"], ["action-1"]);
    expect(outcome.unknown_actions).toEqual(["action-1"]);
    expect(outcome.mutation_retry_allowed).toBe(false);
    expect(outcome.read_retry_allowed).toBe(true);
    expect(outcome.approvals_revoked).toBe(true);
    expect(outcome.resumable_reads).toEqual(["cursor:200"]);
  });

  it("cancels_or_stales_pending_reads_on_stop_and_navigation", () => {
    expect(handleFault("STOP", ["c1"], []).terminal).toBe(true);
    expect(handleFault("STOP", ["c1"], []).resumable_reads).toEqual([]);
    expect(handleFault("NAVIGATION", ["c1"], []).resumable_reads).toEqual([]);
    expect(handleFault("NAVIGATION", [], []).approvals_revoked).toBe(true);
    expect(
      handleFault("PROVIDER_TIMEOUT", ["c1"], ["a1"]).approvals_revoked,
    ).toBe(true);
    expect(handleFault("READ_FAILED", ["c1"], []).terminal).toBe(false);
  });

  it("preserves_partial_denied_and_unapproved_state_through_compaction", () => {
    const compacted = compactContext({
      goal: "input goal",
      request_revision: 2,
      plan_revision: 3,
      binding_revision: "epoch-abcdefghijklmnop",
      approvals: [],
      verified_facts: ["textbox observed"],
      gaps: ["script:DENIED", "plan:UNAPPROVED", "coverage:PARTIAL"],
      evidence_refs: ["ev-ui-abcdefghijklmnop"],
      continuations: ["offset:200"],
      coverage_notes: ["viewport-only synopsis"],
      budget_remaining: "turns:3 reads:5",
    });
    expect(compacted.gaps).toContain("script:DENIED");
    expect(compacted.gaps).toContain("plan:UNAPPROVED");
    expect(compacted.continuations).toEqual(["offset:200"]);
    expect(compacted.budget_remaining).toContain("turns:3");
  });

  it("links_the_failure_chain_without_raw_secrets", () => {
    const bundle = buildDiagnosticBundle({
      request_id: "request-abcdefghijklmnop",
      stages: {
        bootstrap: "rev:1",
        offered_tools: "read_page,propose_set_text",
        tool_calls: "call-1:read_page",
        review: "mismatch",
        dispatch: "skipped",
        verify: "failed",
        terminal: "FAILED",
      },
      masking: { applied: true, redacted_count: 2 },
      dropped_events: 0,
      retention: "bounded",
      failure_class: "failed_verify",
    });
    expect(bundle.failure_class).toBe("failed_verify");
    expect(() =>
      buildDiagnosticBundle({
        ...bundle,
        stages: { ...bundle.stages, bootstrap: "password=x" },
      }),
    ).toThrow("DIAGNOSTIC_LEAK");
    expect(() =>
      buildDiagnosticBundle({
        ...bundle,
        stages: { ...bundle.stages, bootstrap: "Bearer abc123" },
      }),
    ).toThrow("DIAGNOSTIC_LEAK");
  });
});
