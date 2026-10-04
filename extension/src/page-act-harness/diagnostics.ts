import { traceDecision, traceMethod } from "../diagnostics/method-trace.js";

export type DiagnosticStage =
  | "bootstrap"
  | "offered_tools"
  | "tool_calls"
  | "review"
  | "dispatch"
  | "verify"
  | "terminal";

export type DiagnosticBundle = {
  request_id: string;
  stages: Record<DiagnosticStage, string>;
  masking: { applied: boolean; redacted_count: number };
  dropped_events: number;
  retention: string;
  failure_class:
    | "missing_tool"
    | "stale"
    | "denied"
    | "unsupported"
    | "no_call"
    | "failed_verify"
    | "incomplete"
    | "unknown"
    | "consent_required"
    | "none";
};

export const buildDiagnosticBundle = (
  bundle: DiagnosticBundle,
): DiagnosticBundle =>
  traceMethod(
    "page-act-harness/diagnostics.ts:buildDiagnosticBundle",
    { failure_class: bundle.failure_class },
    () => {
      // Raw sources, full DOM, input values, and images are never stored:
      // only safe ids, revisions, coverage, volumes, and masking summaries.
      // NOTE (internal proposal): the leak tripwire below is not a full
      // egress mask — trace-mask.ts maskTraceValue remains the normative
      // filter and must wrap this bundle before export.
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(bundle.request_id))
        throw new Error("REQUEST_ID_INVALID");
      if (!Number.isInteger(bundle.dropped_events) || bundle.dropped_events < 0)
        throw new Error("INVALID_DROPPED_EVENTS");
      const serialized = JSON.stringify(bundle);
      if (
        /password|api[_-]?key|secret|bearer|jwt|cookie|token|otp|ssn|resident|data:image|data:text\/html/i.test(
          serialized,
        )
      )
        throw new Error("DIAGNOSTIC_LEAK");
      traceDecision("page-act-harness.diagnostics.built", {
        failure_class: bundle.failure_class,
        dropped_events: bundle.dropped_events,
      });
      return { ...bundle, stages: { ...bundle.stages } };
    },
  );
