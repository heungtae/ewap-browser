import type { ErrorCode, Outcome } from "./core-types.js";
/**
 * Diagnostics use the same threshold ordering as application logs.  A level
 * retains records at that level and above; `trace` is deliberately temporary
 * and is the only level that exposes execution timelines in the Side Panel.
 */
export type DiagnosticsLevel = "error" | "warn" | "info" | "debug" | "trace";
export type DiagnosticRecordLevel = DiagnosticsLevel;
export type DiagnosticComponent =
  | "panel"
  | "router"
  | "page"
  | "profile"
  | "workflow"
  | "provider"
  | "act"
  | "transport"
  | "storage";
export type DiagnosticEvent =
  | "request.accepted"
  | "request.status"
  | "request.status_rejected"
  | "request.cancel_requested"
  | "request.timeout"
  | "request.restored"
  | "stage.started"
  | "stage.finished"
  | "request.terminal";
export type DiagnosticReason =
  | "panel_stop"
  | "request_timeout"
  | "request_settled"
  | "chat_run_terminal"
  | "storage_flush_failed"
  | "worker_restarted"
  | "panel_context_changed";
export type DiagnosticRecord = {
  schema_version: 1;
  sequence: number;
  timestamp_ms: number;
  worker_instance_id: string;
  request_id: string;
  component: DiagnosticComponent;
  event: DiagnosticEvent;
  level: DiagnosticRecordLevel;
  stage?: string;
  outcome?: Outcome;
  code?: ErrorCode;
  reason?: DiagnosticReason;
  message?: string;
  elapsed_ms?: number;
};

export type DiagnosticsBundleExportRequest = {
  schema_version: 1;
  kind: "DIAGNOSTICS_BUNDLE_EXPORT";
  request_id?: string;
};

export type BundleSectionStatus =
  | "collected"
  | "unavailable"
  | "truncated"
  | "failed";

/**
 * Content-script diagnostic response. Page source, script source, URLs, and
 * titles never cross the extension boundary into a downloadable bundle.
 */
export type ContentDiagnosticsSummary = {
  schema_version: 1;
  document_epoch_digest: string;
  page_scope_epoch_digest: string;
  document: {
    ready_state: "loading" | "interactive" | "complete";
    element_count: number;
    role_counts: Record<string, number>;
    table_count: number;
    table_shape: Array<{ rows: number; columns: number }>;
    list_count: number;
    form_count: number;
    input_counts: Record<string, number>;
  };
  artifacts: {
    html: { bytes: number; sha256: string };
    scripts: {
      total: number;
      inline_count: number;
      external_count: number;
      total_bytes: number;
      digests: string[];
      type_counts: Record<string, number>;
      truncated: boolean;
    };
  };
  page: {
    url_shape: {
      has_query: boolean;
      has_fragment: boolean;
      path_segment_count: number;
    };
    title_length: number;
    referrer_present: boolean;
  };
};
