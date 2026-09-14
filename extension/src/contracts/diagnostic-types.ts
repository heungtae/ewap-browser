import type { ErrorCode, Outcome } from "./core-types.js";
export type DiagnosticsLevel = "off" | "basic" | "debug";
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
  | "stage.started"
  | "stage.finished"
  | "request.terminal";
export type DiagnosticRecord = {
  schema_version: 1;
  sequence: number;
  timestamp_ms: number;
  worker_instance_id: string;
  request_id: string;
  component: DiagnosticComponent;
  event: DiagnosticEvent;
  level: "info" | "warn" | "error" | "debug";
  stage?: string;
  outcome?: Outcome;
  code?: ErrorCode;
  elapsed_ms?: number;
};
