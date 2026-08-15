import { fail } from "../security/validation.js";

export type SessionBinding = {
  id: string;
  runId: string;
  documentEpoch: string;
};

/**
 * Development-fixture-only adapter. It has no network, credential, or
 * production enablement path; production R2 remains owned by the Native Host.
 */
export class LocalFixtureSessionBinding {
  private readonly bindings = new Map<string, SessionBinding>();

  issue(runId: string, documentEpoch: string): SessionBinding {
    const binding = {
      id: `fixture-${crypto.randomUUID()}`,
      runId,
      documentEpoch,
    };
    this.bindings.set(binding.id, binding);
    return binding;
  }

  verify(binding: SessionBinding, runId: string, documentEpoch: string): void {
    const current = this.bindings.get(binding.id);
    if (
      !current ||
      current.runId !== runId ||
      current.documentEpoch !== documentEpoch
    )
      fail("CONFIRMATION_INVALID");
  }

  clear(bindingId: string): void {
    this.bindings.delete(bindingId);
  }
}
