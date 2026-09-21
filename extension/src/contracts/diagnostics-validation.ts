import { isPlainObject } from "../security/validation.js";
import { isErrorCode } from "./error-codes.js";
import type { DiagnosticRecord } from "./diagnostic-types.js";
export const diagnosticStages = [
  "ACCEPTED",
  "PREPARING_PAGE",
  "RESOLVING_PROFILE",
  "DISCOVERING_WORKFLOWS",
  "CONTACTING_PROVIDER",
  "AWAITING_REVIEW",
  "SELECTION_REQUIRED",
  "COMPLETED",
  "FAILED",
  "TERMINAL",
  "PROVIDER_BODY",
  "DISPATCH",
  "VERIFY",
  "DISPATCH_STARTED",
  "URL_OR_SCOPE_CHANGED",
  "SNAPSHOT_VALIDATED",
  "COMPLETION_VERIFIED",
  "VERIFYING_RESULT",
  "VERIFY_PENDING",
  "VERIFY_DEADLINE_EXCEEDED",
  "PAGE_API_PREPARING",
  "PAGE_API_DISPATCH",
  "PAGE_API_RETURNED",
];
export const validDiagnostic = (value: unknown): value is DiagnosticRecord => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "schema_version",
          "sequence",
          "timestamp_ms",
          "worker_instance_id",
          "request_id",
          "component",
          "event",
          "level",
          "stage",
          "outcome",
          "code",
          "reason",
          "message",
          "elapsed_ms",
        ].includes(key),
    )
  )
    return false;
  return (
    value.schema_version === 1 &&
    [value.sequence, value.timestamp_ms, value.elapsed_ms].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0,
    ) &&
    [value.worker_instance_id, value.request_id].every(
      (id) => typeof id === "string" && /^[a-zA-Z0-9-]{16,64}$/.test(id),
    ) &&
    [
      "panel",
      "router",
      "page",
      "profile",
      "workflow",
      "provider",
      "act",
      "transport",
      "storage",
    ].includes(String(value.component)) &&
    [
      "request.accepted",
      "request.status",
      "request.status_rejected",
      "request.cancel_requested",
      "request.timeout",
      "request.restored",
      "stage.started",
      "stage.finished",
      "request.terminal",
    ].includes(String(value.event)) &&
    ["error", "warn", "info", "debug", "trace"].includes(String(value.level)) &&
    (value.stage === undefined ||
      diagnosticStages.includes(String(value.stage))) &&
    (value.outcome === undefined ||
      ["VERIFIED", "FAILED", "UNKNOWN", "CANCELLED"].includes(
        String(value.outcome),
      )) &&
    (value.code === undefined || isErrorCode(value.code)) &&
    (value.reason === undefined ||
      [
        "panel_stop",
        "request_timeout",
        "request_settled",
        "chat_run_terminal",
        "storage_flush_failed",
        "worker_restarted",
        "panel_context_changed",
      ].includes(String(value.reason))) &&
    (value.message === undefined ||
      (typeof value.message === "string" && value.message.length <= 4_000))
  );
};
