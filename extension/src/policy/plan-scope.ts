import { permissionHost } from "./permission-manager.js";
import { fail } from "../security/validation.js";

export type ApprovedPlan = { run_id: string; hosts: readonly string[] };

/** Run-memory only approval. Wildcards, ports, IDs and redirects never expand scope. */
export class PlanScopeStore {
  private readonly plans = new Map<string, Set<string>>();

  public approve(runId: string, origins: readonly string[]): ApprovedPlan {
    if (!runId || origins.length < 1 || origins.length > 16)
      return fail("INVALID_ARGUMENT");
    const hosts = new Set(
      origins.map((origin) => {
        const host = permissionHost(origin);
        if (host.includes("*")) return fail("ORIGIN_NOT_ALLOWED");
        return host;
      }),
    );
    this.plans.set(runId, hosts);
    return { run_id: runId, hosts: [...hosts].sort() };
  }

  public hosts(runId: string): ReadonlySet<string> {
    return this.plans.get(runId) ?? new Set();
  }

  public clear(runId: string): void {
    this.plans.delete(runId);
  }
}
