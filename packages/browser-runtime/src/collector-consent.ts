import { canonical } from "@contextpilot/codebase-schema";
import { UiAuthority, type UiPrincipal } from "@contextpilot/policy-engine";
import type { ToolContext } from "@contextpilot/tool-registry";
export type CollectorDisclosure = "source" | "network_body" | "visual";
export class CollectorConsent {
  private grants = new Map<string, { context: string; expiresAt: number }>();
  constructor(
    private ui: UiAuthority,
    private current: () => ToolContext,
  ) {}
  grant(
    principal: UiPrincipal,
    kind: CollectorDisclosure,
    scopeDigest: string,
  ): void {
    const context = this.current();
    this.ui.assert(principal, context.profileId, context.windowId);
    if (!/^[a-f0-9]{64}$/.test(scopeDigest))
      throw new Error("DISCLOSURE_SCOPE");
    this.grants.set(`${kind}:${scopeDigest}`, {
      context: canonical(context),
      expiresAt: Math.min(
        Date.now() + 10000,
        context.deadline,
        context.leaseExpiresAt,
      ),
    });
  }
  check(kind: CollectorDisclosure, scopeDigest: string): void {
    const grant = this.grants.get(`${kind}:${scopeDigest}`);
    if (
      !grant ||
      grant.expiresAt <= Date.now() ||
      grant.context !== canonical(this.current())
    )
      throw new Error("DISCLOSURE_DENIED");
  }
  revoke(): void {
    this.grants.clear();
  }
}
