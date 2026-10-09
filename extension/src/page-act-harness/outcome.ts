import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import type { TerminalKind } from "./contracts.js";

export type ActionResult = {
  action_id: string;
  dispatched: boolean;
  observed: boolean;
  verifier: "satisfied" | "failed" | "pending";
  alreadySatisfied?: boolean;
};

export type GoalCheck = {
  required_actions: number;
  verified_actions: number;
  final_observation: boolean;
  goal_met: boolean;
};

export const classifyOutcome = (opts: {
  tool_calls_made: boolean;
  read_only: boolean;
  actions: ActionResult[];
  goal?: GoalCheck;
  budget_exhausted?: boolean;
  remaining_work?: boolean;
  unknown_mutation?: boolean;
  binding_current?: boolean;
  unsupported_steps?: number;
}): { kind: TerminalKind; reason: string } =>
  traceMethod(
    "page-act-harness/outcome.ts:classifyOutcome",
    {
      tool_calls_made: opts.tool_calls_made,
      action_count: opts.actions.length,
    },
    (context) => {
      const method = "page-act-harness/outcome.ts:classifyOutcome";
      const done = (
        kind: TerminalKind,
        reason: string,
      ): { kind: TerminalKind; reason: string } => {
        traceDecision("page-act-harness.outcome.classified", {
          kind,
          reason,
          verified_actions: opts.actions.filter(
            (a) => a.verifier === "satisfied",
          ).length,
          total_actions: opts.actions.length,
          goal_state: opts.goal
            ? {
                required: opts.goal.required_actions,
                verified: opts.goal.verified_actions,
                final_observation: opts.goal.final_observation,
                goal_met: opts.goal.goal_met,
              }
            : null,
        });
        return { kind, reason };
      };
      // A response without tool calls is never page-change success.
      if (!opts.tool_calls_made || opts.read_only)
        return done("ANSWER_ONLY", "NO_TOOL_CALL");
      // Silently dropped unsupported steps must never look executable.
      if ((opts.unsupported_steps ?? 0) > 0) {
        traceBranch(context, method, "failed", "unsupported", "steps removed");
        return done("FAILED", "UNSUPPORTED_STEP_REMOVED");
      }
      if (opts.binding_current === false)
        return done("UNKNOWN", "STALE_BINDING");
      const failed = opts.actions.filter((a) => a.verifier === "failed");
      if (failed.length > 0) {
        traceBranch(
          context,
          method,
          "failed",
          failed[0]?.action_id ?? "",
          "verifier failed",
        );
        return done("FAILED", "VERIFIER_FAILED");
      }
      if (opts.unknown_mutation === true)
        return done("UNKNOWN", "UNOBSERVED_MUTATION");
      const unverified = opts.actions.filter(
        (a) =>
          (!a.dispatched && !a.alreadySatisfied) ||
          !a.observed ||
          a.verifier !== "satisfied",
      );
      if (unverified.length > 0) return done("UNKNOWN", "UNOBSERVED_ACTION");
      // Budget exhaustion preserves remaining work: it outranks a would-be
      // VERIFIED/GOAL promotion but never hides a FAILED/UNKNOWN above.
      if (opts.budget_exhausted === true)
        return done("INCOMPLETE", "BUDGET_EXHAUSTED");
      if (opts.remaining_work === true) return done("INCOMPLETE", "GOAL_UNMET");
      if (opts.actions.length === 0) return done("ANSWER_ONLY", "READS_ONLY");
      // Step success never auto-promotes to goal success; goal counts are
      // cross-checked against the satisfied actions (no subset success).
      const satisfied = opts.actions.filter(
        (a) => a.verifier === "satisfied",
      ).length;
      if (!opts.goal || !opts.goal.final_observation || !opts.goal.goal_met)
        return done("VERIFIED", "ACTIONS_VERIFIED_GOAL_UNCONFIRMED");
      if (
        opts.goal.required_actions <= 0 ||
        opts.goal.verified_actions > satisfied ||
        opts.goal.verified_actions < opts.goal.required_actions
      )
        return done("VERIFIED", "PARTIAL_ACTIONS");
      return done("GOAL_VERIFIED", "GOAL_OBSERVED");
    },
  );

// Internal-only transition proposal (NOT a finalized wire migration):
// legacy consumers read `outcome` (VERIFIED) while new consumers read
// `terminal`. ANSWER_ONLY/INCOMPLETE collapse to UNKNOWN on the legacy wire,
// which loses information — keep both fields until the §15 migration
// (explicit additive field + backward-compat tests) is decided.
export const toLegacyOutcome = (
  kind: TerminalKind,
): "VERIFIED" | "FAILED" | "UNKNOWN" =>
  kind === "GOAL_VERIFIED" || kind === "VERIFIED"
    ? "VERIFIED"
    : kind === "FAILED"
      ? "FAILED"
      : "UNKNOWN";
