import type { ActionIntent } from "../contracts/types.js";
import { digestCanonical } from "../security/canonical.js";
import { isPlainObject } from "../security/validation.js";
import type { Run } from "../state/run-coordinator.js";

type Dependencies = {
  readAll(): Promise<{
    tabId: number;
    snapshot: {
      document_epoch: string;
      nodes: Array<{ ref_id: string; state: Record<string, unknown> }>;
    };
  }>;
  send(tabId: number, message: unknown): Promise<unknown>;
  tab(tabId: number): Promise<{ url?: string }>;
  scope?(
    tabId: number,
  ): { document_epoch: string; page_scope_epoch: string } | undefined;
  milestone?(tabId: number, stage: string): void;
};

export const createActPostconditionVerifier = (dependencies: Dependencies) => {
  const semantic = async (run: Run, intent: ActionIntent): Promise<boolean> => {
    const verifier = intent.verifier;
    if (
      verifier.kind !== "semantic-state-transition" ||
      verifier.required_changes.length === 0
    )
      return false;
    try {
      const active = await dependencies.readAll();
      if (
        active.tabId !== run.tabId ||
        active.snapshot.document_epoch !== run.documentEpoch
      )
        return false;
      const target = active.snapshot.nodes.find(
        (node) => node.ref_id === intent.ref_id,
      );
      if (
        !target ||
        digestCanonical(target.state) === verifier.pre_state_digest
      )
        return false;
      return verifier.required_changes.every((change) => {
        const node = active.snapshot.nodes.find(
          (item) => item.ref_id === change.ref_id,
        );
        return !!node && node.state[change.field] === change.expected;
      });
    } catch {
      return false;
    }
  };
  const bounded = async (run: Run, intent: ActionIntent): Promise<boolean> => {
    if (
      intent.verifier.kind !== "semantic-state-transition" ||
      intent.verifier.required_changes.length !== 0
    )
      return false;
    try {
      const result = await dependencies.send(run.tabId, {
        kind: "CONTENT_VERIFY_BOUNDED_POSTCONDITION",
        intent,
      });
      if (
        !isPlainObject(result) ||
        result.ok !== true ||
        !isPlainObject(result.state)
      )
        return false;
      const state = result.state;
      if (
        Object.keys(state).some(
          (key) =>
            ![
              "disabled",
              "checked",
              "selected",
              "expanded",
              "required",
            ].includes(key) || typeof state[key] !== "boolean",
        )
      )
        return false;
      return digestCanonical(state) !== intent.verifier.pre_state_digest;
    } catch {
      return false;
    }
  };
  const navigationTarget = (targetUrl: unknown): string | undefined => {
    if (typeof targetUrl !== "string") return undefined;
    try {
      const parsed = new URL(targetUrl);
      return ["http:", "https:"].includes(parsed.protocol)
        ? parsed.href
        : undefined;
    } catch {
      return undefined;
    }
  };
  const waitForNavigation = async (
    tabId: number,
    expected: string,
  ): Promise<boolean> => {
    const expiresAt = Date.now() + 4_000;
    while (Date.now() <= expiresAt) {
      try {
        const current = await dependencies.tab(tabId);
        if (current.url && new URL(current.url).href === expected) return true;
      } catch {
        return false;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    return false;
  };
  const waitForSameOriginNavigation = async (
    tabId: number,
    beforeUrl: string,
    origin: string,
  ): Promise<boolean> => {
    let before: URL;
    try {
      before = new URL(beforeUrl);
    } catch {
      return false;
    }
    if (before.origin !== origin) return false;
    const expiresAt = Date.now() + 4_000;
    while (Date.now() <= expiresAt) {
      try {
        const current = await dependencies.tab(tabId);
        if (!current.url) return false;
        const after = new URL(current.url);
        if (after.origin === origin && after.href !== before.href) return true;
      } catch {
        return false;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    return false;
  };
  /**
   * A URL change is only a transition signal. Completion requires a changed
   * registered scope and a fresh semantic snapshot from that scope.
   */
  const waitForPageTransition = async (
    run: Run,
    beforeUrl: string,
    origin: string,
    expectedUrl?: string,
    beforeScope?: { document_epoch: string; page_scope_epoch: string },
  ): Promise<boolean> => {
    let before: URL;
    try {
      before = new URL(beforeUrl);
    } catch {
      return false;
    }
    const baselineScope = beforeScope ?? dependencies.scope?.(run.tabId);
    const expiresAt = Date.now() + 15_000;
    let observedTransition = false;
    while (Date.now() <= expiresAt) {
      try {
        const current = await dependencies.tab(run.tabId);
        if (!current.url) return false;
        const after = new URL(current.url);
        const urlChanged =
          (expectedUrl === undefined || after.href === expectedUrl) &&
          after.origin === origin &&
          after.href !== before.href;
        const currentScope = dependencies.scope?.(run.tabId);
        const scopeChanged =
          !!baselineScope &&
          !!currentScope &&
          (currentScope.document_epoch !== baselineScope.document_epoch ||
            currentScope.page_scope_epoch !== baselineScope.page_scope_epoch);
        if ((urlChanged || scopeChanged) && !observedTransition) {
          observedTransition = true;
          dependencies.milestone?.(run.tabId, "URL_OR_SCOPE_CHANGED");
        }
        if (observedTransition) {
          const active = await dependencies.readAll();
          const confirmedScope = dependencies.scope?.(run.tabId);
          const freshDocument =
            active.tabId === run.tabId &&
            active.snapshot.document_epoch !== run.documentEpoch;
          const freshScope =
            !!baselineScope &&
            !!confirmedScope &&
            (confirmedScope.document_epoch !== baselineScope.document_epoch ||
              confirmedScope.page_scope_epoch !==
                baselineScope.page_scope_epoch);
          const registeredSnapshot =
            !confirmedScope ||
            active.snapshot.document_epoch === confirmedScope.document_epoch;
          if (
            registeredSnapshot &&
            (freshDocument || freshScope) &&
            active.snapshot.nodes.length > 0
          ) {
            dependencies.milestone?.(run.tabId, "SNAPSHOT_VALIDATED");
            return true;
          }
        }
      } catch {
        // A document can reject a snapshot while it is loading. The fixed
        // deadline, not the transient error, determines the outcome.
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
    return false;
  };
  return {
    bounded,
    navigationTarget,
    semantic,
    waitForPageTransition,
    waitForSameOriginNavigation,
    waitForNavigation,
  };
};
