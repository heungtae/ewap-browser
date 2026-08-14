import { companyToolSpec } from '../tools/tool-registry.js';

const R3_ACTION = /\b(delete|remove|destroy|terminate|cancel|purge|drop|revoke|탈퇴|삭제|폐기|해지)\b/i;
const R2_ACTION = /\b(save|submit|publish|approve|send|create|update|activate|deploy|commit|저장|등록|승인|전송|생성|수정|배포)\b/i;
const R2_TOOL_NAMES = new Set(['click_ax', 'press_keys']);

function safeArgsShape(args = {}) {
  return Object.keys(args).sort().map((key) => {
    const value = args[key];
    if (/text|value|password|token|secret|code/i.test(key)) return `${key}=<redacted>`;
    if (typeof value === 'string') return `${key}=${value.slice(0, 120)}`;
    if (typeof value === 'number' || typeof value === 'boolean') return `${key}=${value}`;
    return `${key}=<structured>`;
  }).join('&');
}

export function classifyCompanyRisk({ name, targetName = '' }) {
  const spec = companyToolSpec(name);
  if (!spec?.mutation) return { risk: 'R0', reason: 'read_or_control' };
  const label = String(targetName || '');
  if (R3_ACTION.test(label)) return { risk: 'R3', reason: 'destructive_target' };
  if (R2_ACTION.test(label) || R2_TOOL_NAMES.has(name)) return { risk: 'R2', reason: 'business_mutation' };
  return { risk: spec.risk || 'R1', reason: 'reversible_form_mutation' };
}

export function mutationFingerprint({ name, args, origin }) {
  return `${String(origin || '')}|${String(name || '')}|${safeArgsShape(args)}`;
}

export class CompanyMutationPolicy {
  constructor({ now = () => Date.now(), confirmationTtlMs = 5 * 60 * 1000 } = {}) {
    this.now = now;
    this.confirmationTtlMs = confirmationTtlMs;
    this.pending = new Map();
    this.executed = new Set();
  }

  authorize({ name, args = {}, origin, targetName = '', confirmationId = '' }) {
    const risk = classifyCompanyRisk({ name, targetName });
    const fingerprint = mutationFingerprint({ name, args, origin });
    if (risk.risk === 'R3') return { allowed: false, code: 'R3_DENIED', risk, error: 'Destructive action is denied by Company policy.' };
    if (this.executed.has(fingerprint)) return { allowed: false, code: 'DUPLICATE_MUTATION', risk, error: 'An equivalent mutation was already dispatched and will not be retried automatically.' };
    if (risk.risk !== 'R2') return { allowed: true, risk, fingerprint };
    const confirmation = confirmationId
      ? this.pending.get(confirmationId)
      : [...this.pending.values()].find((entry) => entry.approved && entry.fingerprint === fingerprint);
    if (!confirmation || confirmation.expiresAt < this.now() || confirmation.fingerprint !== fingerprint) {
      const id = `confirm_${this.now()}_${Math.random().toString(36).slice(2, 10)}`;
      this.pending.set(id, { fingerprint, expiresAt: this.now() + this.confirmationTtlMs, approved: false, risk });
      return { allowed: false, code: 'R2_CONFIRMATION_REQUIRED', risk, confirmationId: id, error: 'Business mutation requires explicit user confirmation.' };
    }
    if (!confirmation.approved) return { allowed: false, code: 'R2_CONFIRMATION_REQUIRED', risk, confirmationId, error: 'Business mutation requires explicit user confirmation.' };
    for (const [id, entry] of this.pending.entries()) {
      if (entry === confirmation) this.pending.delete(id);
    }
    return { allowed: true, risk, fingerprint };
  }

  approve(confirmationId) {
    const pending = this.pending.get(String(confirmationId || ''));
    if (!pending || pending.expiresAt < this.now()) return false;
    pending.approved = true;
    return true;
  }

  listPending() {
    const now = this.now();
    return [...this.pending.entries()]
      .filter(([, entry]) => entry.expiresAt >= now)
      .map(([id, entry]) => ({ id, risk: entry.risk.risk, expiresAt: entry.expiresAt, approved: entry.approved }));
  }

  recordDispatch(fingerprint) {
    if (fingerprint) this.executed.add(fingerprint);
  }
}
