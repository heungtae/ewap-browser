import type { ActionIntent } from "../contracts/types.js";
import { digestCanonical } from "../security/canonical.js";
import { isPlainObject } from "../security/validation.js";
import type { Run } from "../state/run-coordinator.js";

type Dependencies = {
  readAll(tabId: number): Promise<{
    tabId: number;
    snapshot: {
      document_epoch: string;
      truncated?: boolean;
      nodes: Array<{
        ref_id: string;
        role?: string;
        name?: string;
        visible?: boolean;
        state: Record<string, unknown>;
      }>;
    };
  }>;
  send(tabId: number, message: unknown): Promise<unknown>;
  tab(tabId: number): Promise<{ url?: string }>;
  scope?(
    tabId: number,
  ): { document_epoch: string; page_scope_epoch: string } | undefined;
  milestone?(tabId: number, stage: string): void;
};

export type CompletionEvaluation = {
  status: "satisfied" | "pending" | "inconclusive" | "invalid";
  reason:
    | "EXPECTED_STATE_MATCHED"
    | "EXPECTED_STATE_PENDING"
    | "TARGET_MISSING"
    | "TARGET_AMBIGUOUS"
    | "SCOPE_NOT_READY"
    | "SNAPSHOT_TRUNCATED"
    | "CONTRACT_INVALID"
    | "OWNERSHIP_MISMATCH"
    | "SCHEMA_INVALID"
    | "VERIFY_DEADLINE_EXCEEDED";
};

export const createActPostconditionVerifier = (dependencies: Dependencies) => {
  const markerBaselines = new Map<string, boolean>();
  const markerMatches = (
    node: {
      role?: string;
      name?: string;
      visible?: boolean;
      state: Record<string, unknown>;
    },
    marker: {
      role: string;
      name: string;
      state?: { field: string; expected: boolean };
    },
  ): boolean =>
    node.visible === true &&
    node.role === marker.role &&
    node.name === marker.name &&
    (!marker.state || node.state[marker.state.field] === marker.state.expected);
  const canVerify = (intent: ActionIntent, value?: string): boolean =>
    (intent.verifier.kind === "semantic-state-transition" &&
      intent.verifier.required_changes.length > 0) ||
    (intent.tool === "set_text_by_ref" && value !== undefined) ||
    intent.completion?.kind === "ui_relation";

  const prepare = async (run: Run, intent: ActionIntent): Promise<boolean> => {
    const completion = intent.completion;
    if (completion?.kind !== "ui_relation") return true;
    try {
      const active = await dependencies.readAll(run.tabId);
      if (
        active.tabId !== run.tabId ||
        active.snapshot.document_epoch !== run.documentEpoch ||
        active.snapshot.truncated
      )
        return false;
      const matches = active.snapshot.nodes.filter((node) =>
        markerMatches(node, completion.marker),
      );
      if (matches.length > 1) return false;
      markerBaselines.set(run.id, matches.length === 1);
      return matches.length === 0;
    } catch {
      return false;
    }
  };
  const release = (run: Run): void => {
    markerBaselines.delete(run.id);
  };

  const evaluate = async (
    run: Run,
    intent: ActionIntent,
  ): Promise<CompletionEvaluation> => {
    const verifier = intent.verifier;
    const completion = intent.completion;
    if (completion?.kind === "ui_relation") {
      try {
        const active = await dependencies.readAll(run.tabId);
        if (active.tabId !== run.tabId)
          return { status: "invalid", reason: "OWNERSHIP_MISMATCH" };
        if (active.snapshot.document_epoch !== run.documentEpoch)
          return { status: "pending", reason: "SCOPE_NOT_READY" };
        if (active.snapshot.truncated)
          return { status: "inconclusive", reason: "SNAPSHOT_TRUNCATED" };
        const matches = active.snapshot.nodes.filter((node) =>
          markerMatches(node, completion.marker),
        );
        if (matches.length > 1)
          return { status: "inconclusive", reason: "TARGET_AMBIGUOUS" };
        if (matches.length === 1 && markerBaselines.get(run.id) === false)
          return { status: "satisfied", reason: "EXPECTED_STATE_MATCHED" };
        return { status: "pending", reason: "EXPECTED_STATE_PENDING" };
      } catch {
        return { status: "inconclusive", reason: "SCHEMA_INVALID" };
      }
    }
    if (
      verifier.kind !== "semantic-state-transition" ||
      verifier.required_changes.length === 0
    )
      return { status: "invalid", reason: "CONTRACT_INVALID" };
    try {
      const active = await dependencies.readAll(run.tabId);
      if (active.tabId !== run.tabId)
        return { status: "invalid", reason: "OWNERSHIP_MISMATCH" };
      if (active.snapshot.document_epoch !== run.documentEpoch)
        return { status: "pending", reason: "SCOPE_NOT_READY" };
      if (active.snapshot.truncated)
        return { status: "inconclusive", reason: "SNAPSHOT_TRUNCATED" };
      let target = active.snapshot.nodes.find(
        (node) => node.ref_id === intent.ref_id,
      );
      if (!target && intent.verification_target) {
        const candidates = active.snapshot.nodes.filter(
          (node) =>
            node.role === intent.verification_target?.role &&
            node.name === intent.verification_target?.name,
        );
        if (candidates.length > 1)
          return { status: "inconclusive", reason: "TARGET_AMBIGUOUS" };
        target = candidates[0];
      }
      if (!target) return { status: "pending", reason: "TARGET_MISSING" };
      if (digestCanonical(target.state) === verifier.pre_state_digest)
        return { status: "pending", reason: "EXPECTED_STATE_PENDING" };
      const matched = verifier.required_changes.every((change) => {
        const node = active.snapshot.nodes.find(
          (item) =>
            item.ref_id ===
            (change.ref_id === intent.ref_id ? target.ref_id : change.ref_id),
        );
        return !!node && node.state[change.field] === change.expected;
      });
      return matched
        ? { status: "satisfied", reason: "EXPECTED_STATE_MATCHED" }
        : { status: "pending", reason: "EXPECTED_STATE_PENDING" };
    } catch {
      return { status: "inconclusive", reason: "SCHEMA_INVALID" };
    }
  };
  const semantic = async (run: Run, intent: ActionIntent): Promise<boolean> =>
    (await evaluate(run, intent)).status === "satisfied";

  const verify = async (
    run: Run,
    intent: ActionIntent,
    value?: string,
  ): Promise<CompletionEvaluation> => {
    const deadline = Date.now() + 15_000;
    dependencies.milestone?.(run.tabId, "VERIFYING_RESULT");
    if (intent.tool === "set_text_by_ref" && value !== undefined) {
      try {
        const result = await dependencies.send(run.tabId, {
          kind: "CONTENT_VERIFY_BOUNDED_POSTCONDITION",
          intent,
          value_delivery: {
            value_slot_id: intent.value_binding?.value_slot_id,
            value_kind: "text",
            value,
          },
        });
        if (
          isPlainObject(result) &&
          result.ok === true &&
          result.matches === true
        )
          return { status: "satisfied", reason: "EXPECTED_STATE_MATCHED" };
      } catch {
        return { status: "inconclusive", reason: "SCHEMA_INVALID" };
      }
    }
    let last: CompletionEvaluation = {
      status: "pending",
      reason: "EXPECTED_STATE_PENDING",
    };
    while (Date.now() <= deadline) {
      last = await evaluate(run, intent);
      if (last.status === "satisfied" || last.status === "invalid") return last;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
    dependencies.milestone?.(run.tabId, "VERIFY_DEADLINE_EXCEEDED");
    return {
      status: last.status === "inconclusive" ? "inconclusive" : "pending",
      reason: "VERIFY_DEADLINE_EXCEEDED",
    };
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
          const active = await dependencies.readAll(run.tabId);
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
    canVerify,
    evaluate,
    navigationTarget,
    prepare,
    release,
    semantic,
    verify,
    waitForPageTransition,
    waitForSameOriginNavigation,
    waitForNavigation,
  };
};
