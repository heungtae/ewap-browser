import type { Capability } from "../policy/permission-manager.js";

export type PageMethodDescriptor = {
  method_ref: string;
  object_path: string[];
  method_name: string;
  arity: number;
  function_kind: "async" | "sync" | "unknown";
  locator_revision: string;
};

export type PageMethodRef = PageMethodDescriptor;

export type PageMethodIntent = {
  kind: "page_method";
  run_id: string;
  tab_id: number;
  document_id: string;
  document_epoch: string;
  page_scope_epoch: string;
  origin: string;
  request_generation: number;
  plan_id?: string;
  plan_revision?: number;
  source_evidence_id: string;
  method: PageMethodDescriptor;
  arguments: unknown[];
  arguments_digest: string;
  capability: Extract<Capability, "page_method">;
  approval_digest: string;
};

export type PageMethodResult = {
  dispatch: "not_dispatched" | "dispatched" | "unknown";
  invocation: "not_started" | "returned" | "threw" | "timed_out" | "unknown";
  return_data?: { available: boolean; value?: unknown; truncated?: boolean };
  code?: string;
};

export type MainPageMethodCandidate = Omit<PageMethodDescriptor, "method_ref">;
export type MainPageMethodOutcome =
  | { status: "returned"; value: unknown; truncated: boolean }
  | { status: "not_found" | "stale" | "threw" | "invalid" };
