const VERIFIED_FORM_TOOLS = new Set(['set_field', 'type_ax', 'set_checked', 'select_option']);

export function verifyCompanyAction({ name, response }) {
  if (!VERIFIED_FORM_TOOLS.has(name)) return response;
  if (response?.success === true && response?.verified === true) {
    return { ...response, outcome: 'VERIFIED', retryable: false };
  }
  if (response?.dispatched === true || response?.outcomeUnknown === true) {
    return {
      ...response,
      success: false,
      outcome: 'UNKNOWN',
      retryable: false,
      error: response?.error || 'Mutation outcome is unknown; do not retry automatically.',
    };
  }
  return { ...response, outcome: 'FAILED', retryable: false };
}
