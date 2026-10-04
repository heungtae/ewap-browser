import { traceDecision, traceMethod } from "../diagnostics/method-trace.js";
import { isOpaqueId } from "./contracts.js";

export type FaultEvent =
  | "STOP"
  | "NAVIGATION"
  | "PROVIDER_TIMEOUT"
  | "WORKER_RESTART"
  | "READ_FAILED";

export type FaultOutcome = {
  terminal: boolean;
  resumable_reads: string[];
  unknown_actions: string[];
  approvals_revoked: boolean;
  read_retry_allowed: boolean;
  mutation_retry_allowed: boolean;
};

export const handleFault = (
  event: FaultEvent,
  pendingReads: string[],
  inFlightMutations: string[],
): FaultOutcome =>
  traceMethod(
    "page-act-harness/recovery.ts:handleFault",
    { event, pending_count: pendingReads.length },
    () => {
      // Stop cancels pending reads; navigation stales old cursors/refs, so
      // neither resumes them. Timeouts/restarts keep read cursors for a
      // fresh-bootstrap re-read. In-flight mutations always become UNKNOWN
      // and never auto-retry without idempotency evidence.
      const resumable =
        event === "STOP" || event === "NAVIGATION" ? [] : [...pendingReads];
      const outcome: FaultOutcome = {
        terminal: event === "STOP" || event === "NAVIGATION",
        resumable_reads: resumable,
        unknown_actions: [...inFlightMutations],
        approvals_revoked:
          event === "STOP" ||
          event === "WORKER_RESTART" ||
          event === "NAVIGATION" ||
          event === "PROVIDER_TIMEOUT",
        read_retry_allowed: event !== "STOP" && event !== "NAVIGATION",
        mutation_retry_allowed: false,
      };
      traceDecision("page-act-harness.fault.handled", {
        event,
        terminal: outcome.terminal,
        resumable_reads: outcome.resumable_reads.length,
        unknown_actions: outcome.unknown_actions.length,
        approvals_revoked: outcome.approvals_revoked,
      });
      return outcome;
    },
  );

export type CompactedContext = {
  goal: string;
  request_revision: number;
  plan_revision: number;
  binding_revision: string;
  approvals: string[];
  verified_facts: string[];
  gaps: string[];
  evidence_refs: string[];
  continuations: string[];
  coverage_notes: string[];
  budget_remaining: string;
};

export const compactContext = (input: CompactedContext): CompactedContext =>
  traceMethod(
    "page-act-harness/recovery.ts:compactContext",
    { request_revision: input.request_revision },
    () => {
      // Compaction preserves revision boundaries, verified facts, gaps, and
      // continuations. Partial coverage, denials, and unapproved plans are
      // carried over verbatim — never promoted to complete/approved.
      if (input.request_revision < 1)
        throw new Error("REQUEST_REVISION_INVALID");
      if (!input.goal || input.goal.trim().length === 0)
        throw new Error("GOAL_REQUIRED");
      if (!isOpaqueId(input.binding_revision))
        throw new Error("BINDING_INVALID");
      const compacted: CompactedContext = {
        goal: input.goal,
        request_revision: input.request_revision,
        plan_revision: input.plan_revision,
        binding_revision: input.binding_revision,
        approvals: [...input.approvals],
        verified_facts: [...input.verified_facts],
        gaps: [...input.gaps],
        evidence_refs: [...input.evidence_refs],
        continuations: [...input.continuations],
        coverage_notes: [...input.coverage_notes],
        budget_remaining: input.budget_remaining,
      };
      traceDecision("page-act-harness.context.compacted", {
        gap_count: compacted.gaps.length,
        continuation_count: compacted.continuations.length,
        coverage_notes: compacted.coverage_notes.length,
      });
      return compacted;
    },
  );
