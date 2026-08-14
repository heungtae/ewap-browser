export const COMPANY_PROVIDER_ID = 'company-vllm';

export const DEFAULT_COMPANY_CONFIG = Object.freeze({
  provider: Object.freeze({
    baseUrl: 'https://ai.company.net/v1',
    model: 'Qwen3.5-32B-Instruct',
    timeoutMs: 90000,
    temperature: 0.1,
    maxTokens: 4096,
  }),
  allowedOrigins: Object.freeze(['https://eda.company.net']),
  auditEndpoint: 'https://audit.company.net',
});

function normalizedHttpsOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function normalizeCompanyConfig(raw = {}) {
  const requestedOrigins = Array.isArray(raw.allowedOrigins) ? raw.allowedOrigins : DEFAULT_COMPANY_CONFIG.allowedOrigins;
  const allowedOrigins = [...new Set(requestedOrigins.map(normalizedHttpsOrigin).filter(Boolean))];
  const provider = raw.provider && typeof raw.provider === 'object' ? raw.provider : {};
  const baseUrl = normalizedHttpsOrigin(provider.baseUrl || DEFAULT_COMPANY_CONFIG.provider.baseUrl);
  if (!baseUrl) throw new Error('Managed company provider URL must be an HTTPS origin.');
  const model = String(provider.model || DEFAULT_COMPANY_CONFIG.provider.model).trim();
  if (!model) throw new Error('Managed company provider model must not be empty.');
  return Object.freeze({
    provider: Object.freeze({
      baseUrl: `${baseUrl}/v1`,
      model,
      timeoutMs: Number.isInteger(provider.timeoutMs) ? provider.timeoutMs : DEFAULT_COMPANY_CONFIG.provider.timeoutMs,
      temperature: typeof provider.temperature === 'number' ? provider.temperature : DEFAULT_COMPANY_CONFIG.provider.temperature,
      maxTokens: Number.isInteger(provider.maxTokens) ? provider.maxTokens : DEFAULT_COMPANY_CONFIG.provider.maxTokens,
      apiKey: typeof provider.apiKey === 'string' ? provider.apiKey : '',
    }),
    allowedOrigins: Object.freeze(allowedOrigins),
    auditEndpoint: normalizedHttpsOrigin(raw.auditEndpoint || DEFAULT_COMPANY_CONFIG.auditEndpoint),
  });
}

export async function loadManagedCompanyConfig() {
  const managed = globalThis.chrome?.storage?.managed;
  if (!managed?.get) return normalizeCompanyConfig();
  try {
    const result = await managed.get('companyAgent');
    return normalizeCompanyConfig(result?.companyAgent || {});
  } catch {
    // Missing managed storage must fail closed for Act through the empty origin
    // set while still permitting read-only Ask behavior.
    return normalizeCompanyConfig({ allowedOrigins: [] });
  }
}
