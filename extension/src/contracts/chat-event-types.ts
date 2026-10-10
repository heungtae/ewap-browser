import type { Outcome } from "./core-types.js";

export type ChatMode = "ask" | "act";
export type ActivityStage =
  | "PREPARING_PAGE"
  | "RESOLVING_PROFILE"
  | "DISCOVERING_WORKFLOWS"
  | "CONTACTING_PROVIDER"
  | "VERIFYING_RESULT"
  | "PAGE_API_PREPARING"
  | "PAGE_API_DISPATCH"
  | "PAGE_API_RETURNED"
  | "AWAITING_REVIEW"
  | "SELECTION_REQUIRED"
  | "COMPLETED"
  | "FAILED";
export type SafeToolResult = {
  outcome: Outcome;
  summary: string;
  code?: string;
};
export type ChatActionView = {
  session_id: string;
  proposal_id: string;
  tool: string;
  target_name: string;
  approval_scope?: "single_step" | "session";
  approval_reason?: string;
  origin?: string;
  suggested_value?: string;
  // Full ephemeral approval value, bounded by the 4096-character input contract.
  suggested_value_length?: number;
  suggested_value_truncated?: boolean;
  // F3: tail excerpt and whole-value fingerprint for capped displays, so
  // equal-length values with different tails stay distinguishable.
  suggested_value_tail?: string;
  suggested_value_digest?: string;
  workflow_title?: string;
  workflow_step?: number;
  workflow_total?: number;
};
export type ChatEventPayload =
  | { type: "user_message"; text: string }
  | { type: "page_scope_changed" }
  | { type: "run_started"; mode: ChatMode; permission_mode: string }
  | { type: "activity_started"; stage: ActivityStage }
  | { type: "activity_progress"; stage: ActivityStage }
  | { type: "activity_finished"; stage: ActivityStage }
  | { type: "assistant_delta"; text: string }
  | {
      type: "tool_started";
      tool_use_id: string;
      tool: string;
      summary: string;
      target_name?: string;
    }
  | { type: "tool_progress"; tool_use_id: string; summary: string }
  | { type: "tool_finished"; tool_use_id: string; result: SafeToolResult }
  | { type: "action_review_required"; action: ChatActionView }
  | {
      type: "permission_required";
      request_id: string;
      action: ChatActionView;
      capability: string;
      host: string;
    }
  | {
      type: "value_required";
      action: ChatActionView;
      value_kind: "text" | "option";
    }
  | {
      type: "confirmation_required";
      action: ChatActionView;
      confirmation_id: string;
      confirmation_nonce: string;
    }
  | {
      type: "source_consent_required";
      request_id: string;
      resource_count: number;
      purpose?: "source" | "component-scroll" | "component-vision";
      host: string;
    }
  | { type: "run_terminal"; outcome: Outcome; code?: string };
export type ChatEvent = ChatEventPayload & {
  session_id: string;
  thread_id: string;
  tab_id: number;
  run_id: string;
  sequence: number;
};
