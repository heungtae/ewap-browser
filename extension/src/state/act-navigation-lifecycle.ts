import type { Run } from "./run-coordinator.js";

export type ExpectedNavigation = {
  origin: string;
  pathname: string;
};

type PendingNavigation = ExpectedNavigation & {
  runId: string;
  tabId: number;
};

/**
 * Owns the narrow interval after an approved input may intentionally replace
 * the current document. During that interval the old document binding remains
 * invalid for further actions, but browser lifecycle notifications must not
 * independently turn the in-flight navigation verification into a cancel.
 */
export class ActNavigationLifecycle {
  private readonly pendingByTab = new Map<number, PendingNavigation>();

  public begin(run: Run, expected: ExpectedNavigation): void {
    this.pendingByTab.set(run.tabId, {
      runId: run.id,
      tabId: run.tabId,
      origin: expected.origin,
      pathname: expected.pathname,
    });
  }

  public retains(run: Run): boolean {
    return this.pendingByTab.get(run.tabId)?.runId === run.id;
  }

  public expected(run: Run): ExpectedNavigation | undefined {
    const pending = this.pendingByTab.get(run.tabId);
    if (!pending || pending.runId !== run.id) return undefined;
    return { origin: pending.origin, pathname: pending.pathname };
  }

  public finish(run: Run): void {
    if (this.retains(run)) this.pendingByTab.delete(run.tabId);
  }

  public clearTab(tabId: number): void {
    this.pendingByTab.delete(tabId);
  }
}
