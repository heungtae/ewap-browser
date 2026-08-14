const DEFAULT_LIMIT = 1000;

export function redactAuditEvent(event = {}) {
  const safe = {
    timestamp: typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString(),
    tool: String(event.tool || '').slice(0, 80),
    mode: event.mode === 'ask' ? 'ask' : 'act',
    origin: (() => {
      try { return new URL(String(event.origin || '')).origin; } catch { return ''; }
    })(),
    risk: String(event.risk || 'R0').slice(0, 8),
    outcome: String(event.outcome || '').slice(0, 24),
    success: event.success === true,
    dispatched: event.dispatched === true,
    policy: String(event.policy || '').slice(0, 80),
  };
  return safe;
}

export class CompanyAuditRecorder {
  constructor({ storage = null, key = 'companyAuditEvents', limit = DEFAULT_LIMIT } = {}) {
    this.storage = storage;
    this.key = key;
    this.limit = limit;
    this.events = [];
  }

  async record(event) {
    const safe = redactAuditEvent(event);
    this.events.push(safe);
    if (this.events.length > this.limit) this.events.splice(0, this.events.length - this.limit);
    try { await this.storage?.local?.set?.({ [this.key]: this.events }); } catch {}
    return safe;
  }

  snapshot() {
    return this.events.map((event) => ({ ...event }));
  }
}
