export const COMPANY_TOOLS = [
  "read_semantic_projection",
  "call_page_business_tool",
  "find_by_ref",
  "read_page_summary",
  "set_text_by_ref",
  "select_option_by_ref",
  "set_checked_by_ref",
  "click_by_ref",
  "press_key_by_ref",
  "navigate",
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
  | "navigate"
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
  | "NAVIGATION_UNVERIFIED"
  | "WORKFLOW_STATE_MISMATCH"
  | "WORKFLOW_STEP_LIMIT"
  | "VALUE_BINDING_INVALID"
  | "CONFIRMATION_INVALID"
  | "AI_HUB_NOT_CONFIGURED"
  | "TRANSPORT_FAILED"
  | "PAYLOAD_LIMIT_EXCEEDED"
  | "STORAGE_BOUNDARY_UNAVAILABLE"
  | "PAGE_SCOPE_STALE"
  | "THREAD_LIMIT_REACHED"
  | "CHAT_STORAGE_QUOTA_EXCEEDED"
  | "SESSION_STREAM_BUSY"
  | "CONTEXT_BUDGET_EXCEEDED"
  | "INPUT_REDACTED"
  | "TRANSFER_STALE"
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
  | "VISION_CAPTURE_UNAVAILABLE"
  | "PAGE_TEXT_UNAVAILABLE"
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
