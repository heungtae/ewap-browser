// This boundary applies to every message that reaches the service worker.
// It is intentionally smaller than the UI's historical action vocabulary.
export const COMPANY_BACKGROUND_ACTIONS = new Set([
  'ensure_conversation_id', 'chat_start', 'chat_stream', 'chat', 'continue_start', 'continue',
  'clear_conversation', 'abort', 'agent_run_state', 'agent_run_ack', 'get_page_info',
  'get_providers', 'get_active_prompt_tier', 'approve_company_confirmation',
  'get_company_audit', 'get_company_panel_state', 'set_company_mode', 'company_stop',
]);

export function isCompanyBackgroundActionAllowed(action) {
  return COMPANY_BACKGROUND_ACTIONS.has(String(action || ''));
}
