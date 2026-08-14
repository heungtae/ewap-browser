const MCP_ORIGIN = 'https://mcp.company.net';

/** The only permitted profile network boundary; it sends the sanitized fingerprint. */
export class ManagedPageProfileClient {
  constructor({ endpoint = '', fetchImpl = globalThis.fetch } = {}) {
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
  }

  async resolve(fingerprint) {
    const url = new URL(this.endpoint);
    if (url.origin !== MCP_ORIGIN || !this.fetchImpl) return null;
    const response = await this.fetchImpl(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fingerprint }), credentials: 'omit',
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.profile || null;
  }
}
