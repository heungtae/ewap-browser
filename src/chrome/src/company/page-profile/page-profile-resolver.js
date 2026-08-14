import { companyToolSpec } from '../tools/tool-registry.js';

export function validatePageProfile(raw, fingerprint) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !String(raw.id || '').trim()) return null;
  if (raw.origin !== fingerprint.origin || !Array.isArray(raw.allowedTools)) return null;
  const allowedTools = [...new Set(raw.allowedTools.filter((name) => companyToolSpec(name)))].sort();
  const authoritativeFields = Array.isArray(raw.authoritativeFields)
    ? raw.authoritativeFields.filter((field) => typeof field === 'string' && field.length <= 120).sort()
    : [];
  return Object.freeze({ id: String(raw.id), origin: fingerprint.origin, allowedTools: Object.freeze(allowedTools), authoritativeFields: Object.freeze(authoritativeFields) });
}

export class PageProfileResolver {
  constructor({ client, now = () => Date.now(), ttlMs = 5 * 60 * 1000 } = {}) {
    this.client = client;
    this.now = now;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  async resolve(fingerprint) {
    const key = `${fingerprint.origin}|${fingerprint.semanticHash}`;
    const cached = this.cache.get(key);
    if (cached?.expiresAt >= this.now()) return cached.result;
    let raw = null;
    try { raw = await this.client?.resolve(fingerprint); } catch {}
    const profile = validatePageProfile(raw, fingerprint);
    const result = Object.freeze(profile ? { status: 'resolved', profile } : { status: 'unknown', profile: null });
    this.cache.set(key, { expiresAt: this.now() + this.ttlMs, result });
    return result;
  }

  revokeOrigin(origin) {
    for (const key of this.cache.keys()) if (key.startsWith(`${origin}|`)) this.cache.delete(key);
  }
}
