import { digestCanonical, opaqueId } from "../security/canonical.js";
import { fail } from "../security/validation.js";
export type ConfirmationBinding = {
  run_id: string;
  tab_context: string;
  document_epoch: string;
  intent_digest: string;
  session_binding_id: string;
};
type Confirmation = ConfirmationBinding & {
  id: string;
  nonce: string;
  expiresAt: number;
  consumed: boolean;
};
export class ConfirmationStore {
  private readonly tokens = new Map<string, Confirmation>();
  public issue(
    binding: ConfirmationBinding,
    now = Date.now(),
    ttlMs = 120_000,
  ): Confirmation {
    const token = {
      ...binding,
      id: opaqueId(),
      nonce: opaqueId(),
      expiresAt: now + Math.min(ttlMs, 120_000),
      consumed: false,
    };
    this.tokens.set(token.id, token);
    return token;
  }
  public consume(
    id: string,
    nonce: string,
    binding: ConfirmationBinding,
    now = Date.now(),
  ): void {
    const token = this.tokens.get(id);
    if (
      !token ||
      token.consumed ||
      token.nonce !== nonce ||
      token.expiresAt < now ||
      !same(token, binding)
    ) {
      this.tokens.delete(id);
      return fail("CONFIRMATION_INVALID");
    }
    token.consumed = true;
    this.tokens.delete(id);
  }
  public clear(): void {
    this.tokens.clear();
  }
}
const same = (
  token: ConfirmationBinding,
  binding: ConfirmationBinding,
): boolean =>
  digestCanonical({
    run_id: token.run_id,
    tab_context: token.tab_context,
    document_epoch: token.document_epoch,
    intent_digest: token.intent_digest,
    session_binding_id: token.session_binding_id,
  }) === digestCanonical(binding);
