import { permissionHost } from "./permission-manager.js";
import { fail } from "../security/validation.js";

export type ApprovedPlan = { run_id: string; origins: readonly string[] };

/** Run-memory only approval. Wildcards, ports, IDs and redirects never expand scope. */
export class PlanScopeStore {
  private readonly plans = new Map<string, Set<string>>();

  public approve(runId: string, origins: readonly string[]): ApprovedPlan {
    if (!runId || origins.length < 1 || origins.length > 16)
      return fail("INVALID_ARGUMENT");
    const approved = new Set(
      origins.map((origin) => {
        const url = new URL(origin);
        const host = permissionHost(url.toString());
        if (host.includes("*")) return fail("ORIGIN_NOT_ALLOWED");
        return url.origin;
      }),
    );
    this.plans.set(runId, approved);
    return { run_id: runId, origins: [...approved].sort() };
  }

  public origins(runId: string): ReadonlySet<string> {
    return this.plans.get(runId) ?? new Set();
  }

  public clear(runId: string): void {
    this.plans.delete(runId);
  }
}
