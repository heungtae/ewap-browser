export const COMPANY_TOOLS = [
  "read_semantic_projection",
  "find_by_ref",
  "read_page_summary",
  "set_text_by_ref",
  "select_option_by_ref",
  "set_checked_by_ref",
  "click_by_ref",
  "press_key_by_ref",
  "get_authoritative_field",
] as const;
export type CompanyTool = (typeof COMPANY_TOOLS)[number];
export type MutationTool = Extract<
  CompanyTool,
  | "set_text_by_ref"
  | "select_option_by_ref"
  | "set_checked_by_ref"
  | "click_by_ref"
  | "press_key_by_ref"
>;
export type Mode = "ask" | "act";
export type Risk = "R0" | "R1" | "R2" | "R3";
export type Outcome = "VERIFIED" | "FAILED" | "UNKNOWN" | "CANCELLED";
export type Decision = "ALLOW" | "REQUIRE_CONFIRMATION" | "DENY";
export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "DOCUMENT_NOT_REGISTERED"
  | "POLICY_DENIED"
  | "ORIGIN_NOT_ALLOWED"
  | "PROFILE_UNAVAILABLE"
  | "UNKNOWN_PROFILE"
  | "TARGET_STALE"
  | "TARGET_NOT_ACTIONABLE"
  | "VALUE_BINDING_INVALID"
  | "CONFIRMATION_INVALID"
  | "AI_HUB_NOT_CONFIGURED"
  | "TRANSPORT_FAILED"
  | "PAYLOAD_LIMIT_EXCEEDED"
  | "STORAGE_BOUNDARY_UNAVAILABLE"
  | "INTERNAL_FAILURE"
  | "BUSINESS_MCP_NOT_CONFIGURED"
  | "BUSINESS_MCP_UNAVAILABLE"
  | "BUSINESS_MCP_TIMEOUT"
  | "BUSINESS_MCP_PROTOCOL_ERROR"
  | "PERMISSION_REQUIRED"
  | "CDP_UNAVAILABLE"
  | "CDP_CONFLICT"
  | "CDP_COMMAND_NOT_ALLOWED"
  | "CDP_CLEANUP_FAILED"
  | "PROVIDER_PLUGIN_NOT_FOUND"
  | "PROVIDER_PLUGIN_INCOMPATIBLE"
  | "PROVIDER_PLUGIN_FAILED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_UNAVAILABLE";
export type Role =
  | "button"
  | "checkbox"
  | "combobox"
  | "heading"
  | "link"
  | "option"
  | "radio"
  | "textbox"
  | "listbox"
  | "tab"
  | "menuitem"
  | "dialog"
  | "alert"
  | "status"
  | "navigation"
  | "main"
  | "form";
export type SemanticState = {
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  expanded?: boolean;
  required?: boolean;
};
export type SemanticNode = {
  ref_id: string;
  role: Role;
  name: string;
  state: SemanticState;
  visible: boolean;
  enabled: boolean;
  parent_ref_id?: string;
  label_ref_id?: string;
};
export type SemanticSnapshot = {
  document_epoch: string;
  frame_id: number;
  nodes: SemanticNode[];
};
export type ModelSemanticNode = Omit<
  SemanticNode,
  "ref_id" | "parent_ref_id" | "label_ref_id"
> & { model_ref: string; parent_model_ref?: string; label_model_ref?: string };
export type ModelSemanticSnapshot = {
  document_epoch: string;
  frame_id: number;
  nodes: ModelSemanticNode[];
};
export type ValueKind = "text" | "option";
export type ValueBinding = {
  value_slot_id: string;
  value_kind: ValueKind;
  value_digest: string;
};
export type SemanticStatePredicate = {
  ref_id: string;
  field: "checked" | "selected" | "disabled" | "expanded";
  expected: boolean;
};
export type VerifierPredicate =
  | {
      kind: "semantic-state-transition";
      declaration_id: string;
      pre_state_digest: string;
      required_changes: SemanticStatePredicate[];
    }
  | {
      kind: "exact-navigation-transition";
      declaration_id: string;
      pre_page_context_digest: string;
      origin: string;
      path_template_id: string;
      required_post_states: SemanticStatePredicate[];
    }
  | {
      kind: "business-state-transition";
      declaration_id: string;
      precondition_token: string;
      authoritative_field_id: string;
      expected_transition: string;
    };
export type ActionIntent = {
  tool: MutationTool;
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  profile: { id: string; version: number };
  ref_id: string;
  risk: "R1" | "R2";
  effect: "local-ui-only" | "server-side";
  verifier: VerifierPredicate;
  argument?: { checked?: boolean; key?: "Enter" | "Space" | "Escape" };
  value_binding?: ValueBinding;
};
export type ModelActionProposal =
  | { target: string; tool: "set_text_by_ref" | "select_option_by_ref" }
  | {
      target: string;
      tool: "set_checked_by_ref";
      argument: { checked: boolean };
    }
  | {
      target: string;
      tool: "press_key_by_ref";
      argument: { key: "Enter" | "Space" | "Escape" };
    }
  | { target: string; tool: "click_by_ref" };
export type RuntimeKind =
  | "START_PREVIEW"
  | "START_ASK"
  | "RESOLVE_PROFILE"
  | "START_ACT"
  | "SUBMIT_ACTION_VALUE"
  | "CONTENT_SNAPSHOT"
  | "EXECUTE_ACTION"
  | "VERIFY_RESULT"
  | "CONFIRM"
  | "CANCEL"
  | "PERMISSION_DECISION"
  | "PROVIDER_LIST"
  | "PLUGIN_INSTALL"
  | "PLUGIN_SET_ENABLED"
  | "PROVIDER_SAVE"
  | "PROVIDER_TEST"
  | "PROVIDER_EXPORT"
  | "CHAT_SEND"
  | "PANEL_STATE"
  | "NATIVE_LLM_REQUEST";
export type RuntimeEnvelope<T = unknown> = {
  schema_version: 1;
  kind: RuntimeKind;
  message_id: string;
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  payload: T;
};
export type DocumentRegister = {
  schema_version: 1;
  kind: "DOCUMENT_REGISTER";
  document_epoch: string;
};
export type Sender = {
  id?: string;
  tabId?: number;
  frameId?: number;
  documentId?: string;
  documentLifecycle?: "active" | "prerender" | "cached" | "pending_deletion";
};
