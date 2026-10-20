import { collect } from "@contextpilot/collector";
import { canonical, type Context } from "@contextpilot/codebase-schema";
import type { DiscoveryAdmission } from "./discover.js";
// Content-side read adapter. No storage, model, policy-grant or dispatch imports.
export class DomCollector {
  constructor(
    private root: Element,
    private current: () => Context,
  ) {}
  async collect(admission: DiscoveryAdmission) {
    if (
      !admission.readAllowed ||
      new URL(this.root.ownerDocument.URL).origin !== admission.context.origin
    )
      throw new Error("DISCOVERY_SCOPE_DENIED");
    const fresh = () =>
      !admission.signal.aborted &&
      canonical(this.current()) === canonical(admission.context);
    if (!fresh()) throw new Error("BINDING_STALE");
    return collect(this.root, {
      batchId: admission.batchId,
      deadline: admission.deadline,
      context: admission.context,
      expectedRevision: admission.expectedRevision,
      scope: admission.scope,
      signal: admission.signal,
      current: fresh,
    });
  }
}
