const MCP_ORIGIN = 'https://mcp.company.net';

/** Resolves Page Profile authority without a model fallback or value guess. */
export class AuthoritativeBindingClient {
  constructor({ endpoint = '', fetchImpl = globalThis.fetch } = {}) {
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
  }

  async resolve({ profileId, field }) {
    let url;
    try { url = new URL(this.endpoint); } catch { return { ok: false, code: 'AUTHORITATIVE_BINDING_UNAVAILABLE' }; }
    if (url.origin !== MCP_ORIGIN || !this.fetchImpl) return { ok: false, code: 'AUTHORITATIVE_BINDING_UNAVAILABLE' };
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit',
        body: JSON.stringify({ profileId, field }),
      });
      if (!response.ok) return { ok: false, code: 'AUTHORITATIVE_BINDING_FAILED' };
      const body = await response.json();
      if (body?.authoritative !== true) return { ok: false, code: 'AUTHORITATIVE_BINDING_INVALID' };
      return { ok: true, value: body.value };
    } catch {
      return { ok: false, code: 'AUTHORITATIVE_BINDING_FAILED' };
    }
  }
}

export async function resolveAuthoritativeField({ profile, field, client }) {
  if (!profile?.authoritativeFields?.includes(field)) return { ok: false, code: 'AUTHORITATIVE_FIELD_NOT_DECLARED' };
  return client.resolve({ profileId: profile.id, field });
}
