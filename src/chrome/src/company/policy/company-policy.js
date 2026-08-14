import { companyToolSpec, normalizedCompanyMode } from '../tools/tool-registry.js';

export function isAllowedCompanyOrigin(url, config) {
  try {
    const origin = new URL(String(url || '')).origin;
    return Array.isArray(config?.allowedOrigins) && config.allowedOrigins.includes(origin);
  } catch {
    return false;
  }
}

export function evaluateCompanyTool({ name, mode, pageUrl, config }) {
  const normalizedMode = normalizedCompanyMode(mode);
  const spec = companyToolSpec(name);
  if (!spec || !spec.enabled || !spec.modes.includes(normalizedMode)) {
    return { allowed: false, code: 'COMPANY_TOOL_DENIED', error: `Tool '${name}' is not exposed in Company ${normalizedMode.toUpperCase()} mode.` };
  }
  if (normalizedMode === 'ask' && spec.mutation) {
    return { allowed: false, code: 'ASK_READ_ONLY', error: 'Ask mode is read-only.' };
  }
  if (spec.mutation && !isAllowedCompanyOrigin(pageUrl, config)) {
    return { allowed: false, code: 'ACT_ORIGIN_DENIED', error: 'Act mode is allowed only on a managed enterprise origin.' };
  }
  return { allowed: true, spec };
}
