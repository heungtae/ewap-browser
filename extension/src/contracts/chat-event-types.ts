import type { Outcome } from "./core-types.js";

export type ChatMode = "ask" | "act";
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
  origin?: string;
  suggested_value?: string;
  workflow_title?: string;
  workflow_step?: number;
  workflow_total?: number;
};
export type ChatEventPayload =
  | { type: "user_message"; text: string }
  | { type: "page_scope_changed" }
  | { type: "run_started"; mode: ChatMode; permission_mode: string }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_started"; tool_use_id: string; tool: string; summary: string }
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
  | { type: "run_terminal"; outcome: Outcome; code?: string };
export type ChatEvent = ChatEventPayload & {
  session_id: string;
  thread_id: string;
  tab_id: number;
  run_id: string;
  sequence: number;
};
