import { withDeadline } from "../security/deadline.js";
import type {
  PageApiDispatchResult,
  PageApiIntent,
} from "../contracts/page-api-types.js";
import { pageApiRegistry, type PageApiRegistry } from "../page-api/registry.js";
import {
  invokeFixturePageApi,
  mainPageApiResult,
  pageApiApprovalDigest,
  pageApiCompletionDigest,
} from "./page-api-main.js";

export { pageApiApprovalDigest } from "./page-api-main.js";
type Scope = { document_epoch: string; page_scope_epoch: string };
type Injection = { frameId?: number; documentId?: string; result?: unknown };
type Dependencies = {
  scripting?: {
    executeScript(injection: {
      target: { tabId: number; documentIds: string[] };
      world: "MAIN";
      func: (...args: never[]) => unknown;
      args: unknown[];
    }): Promise<Injection[]>;
  };
  beforeDispatch(tabId: number): Promise<void>;
  documentFor(
    tabId: number,
    frameId: number,
  ): { epoch: string; documentId: string } | undefined;
  scope(tabId: number): Scope | undefined;
  observe(
    intent: PageApiIntent,
    optionName: string,
    completion: { control_name: string; option_name: string },
    remainingMs: number,
  ): Promise<"satisfied" | "pending" | "invalid">;
  now?(): number;
  registry?: PageApiRegistry;
  milestone?(
    tabId: number,
    stage:
      | "PAGE_API_PREPARING"
      | "PAGE_API_DISPATCH"
      | "PAGE_API_RETURNED"
      | "VERIFYING_RESULT",
  ): void;
  progress?(
    runId: string,
    stage:
      | "PAGE_API_PREPARING"
      | "PAGE_API_DISPATCH"
      | "PAGE_API_RETURNED"
      | "VERIFYING_RESULT",
  ): void;
};

export const createPageApiRunner = (dependencies: Dependencies) => {
  const inFlight = new Set<string>();
  const consumed = new Set<string>();
  const now = () => dependencies.now?.() ?? Date.now();
  const mark = (
    intent: PageApiIntent,
    stage:
      | "PAGE_API_PREPARING"
      | "PAGE_API_DISPATCH"
      | "PAGE_API_RETURNED"
      | "VERIFYING_RESULT",
  ) => {
    dependencies.milestone?.(intent.tab_id, stage);
    dependencies.progress?.(intent.run_id, stage);
  };
  const execute = async (
    intent: PageApiIntent,
    path: string,
  ): Promise<PageApiDispatchResult> => {
    const key = `${intent.run_id}:${intent.adapter_id}:${intent.action_id}`;
    if (inFlight.has(key) || consumed.has(key))
      return { ok: false, outcome: "FAILED", code: "POLICY_DENIED" };
    const registry = dependencies.registry ?? pageApiRegistry;
    const found = registry.action(
      intent.origin,
      path,
      intent.adapter_id,
      intent.adapter_version,
      intent.action_id,
    );
    if (!found || !found.action.option_ids.includes(intent.option_id))
      return { ok: false, outcome: "FAILED", code: "PAGE_API_UNAVAILABLE" };
    const expectedDigest = pageApiApprovalDigest({
      kind: "page_api",
      frame_id: 0,
      origin: intent.origin,
      adapter_id: intent.adapter_id,
      adapter_version: intent.adapter_version,
      action_id: intent.action_id,
      option_id: intent.option_id,
      completion_digest: pageApiCompletionDigest(found.action.completion),
      capability: "page_api",
    });
    if (intent.approval_digest !== expectedDigest)
      return {
        ok: false,
        outcome: "FAILED",
        code: "PAGE_API_CONTRACT_INVALID",
      };
    const document = dependencies.documentFor(intent.tab_id, 0);
    const scope = dependencies.scope(intent.tab_id);
    if (
      !dependencies.scripting ||
      !document ||
      document.epoch !== intent.document_epoch ||
      document.documentId !== intent.document_id ||
      !scope ||
      scope.document_epoch !== intent.document_epoch ||
      scope.page_scope_epoch !== intent.page_scope_epoch
    )
      return { ok: false, outcome: "FAILED", code: "PAGE_SCOPE_STALE" };
    const optionName = found.action.option_labels[intent.option_id];
    if (!optionName)
      return {
        ok: false,
        outcome: "FAILED",
        code: "PAGE_API_CONTRACT_INVALID",
      };
    const started = now();
    const remaining = () => Math.max(0, 15_000 - (now() - started));
    mark(intent, "PAGE_API_PREPARING");
    const before = await dependencies
      .observe(intent, optionName, found.action.completion, remaining())
      .catch(() => "invalid" as const);
    if (before === "satisfied")
      return { ok: true, outcome: "ALREADY_SATISFIED" };
    if (before !== "pending" || remaining() === 0)
      return { ok: false, outcome: "FAILED", code: "PAGE_API_UNAVAILABLE" };
    inFlight.add(key);
    let dispatched = false;
    try {
      await dependencies.beforeDispatch(intent.tab_id);
      const current = dependencies.documentFor(intent.tab_id, 0);
      const currentScope = dependencies.scope(intent.tab_id);
      if (
        !current ||
        current.epoch !== intent.document_epoch ||
        current.documentId !== intent.document_id ||
        !currentScope ||
        currentScope.page_scope_epoch !== intent.page_scope_epoch
      )
        return { ok: false, outcome: "FAILED", code: "PAGE_SCOPE_STALE" };
      mark(intent, "PAGE_API_DISPATCH");
      dispatched = true;
      const injected = await withDeadline(
        dependencies.scripting.executeScript({
          target: { tabId: intent.tab_id, documentIds: [intent.document_id] },
          world: "MAIN",
          func: invokeFixturePageApi as never,
          args: [intent.adapter_id, intent.action_id, intent.option_id],
        }),
        Math.min(5_000, remaining()),
        "PAGE_API_TIMEOUT",
      );
      mark(intent, "PAGE_API_RETURNED");
      const only = injected.length === 1 && injected[0];
      if (!only || only.frameId !== 0 || only.documentId !== intent.document_id)
        return {
          ok: false,
          outcome: "UNKNOWN",
          code: "PAGE_API_CONTRACT_INVALID",
        };
      const returned = mainPageApiResult(only.result);
      if (returned !== "called")
        return {
          ok: false,
          outcome: returned === "unavailable" ? "UNKNOWN" : "UNKNOWN",
          code:
            returned === "invalid"
              ? "PAGE_API_CONTRACT_INVALID"
              : "PAGE_API_CALL_FAILED",
        };
      mark(intent, "VERIFYING_RESULT");
      const after = await dependencies
        .observe(intent, optionName, found.action.completion, remaining())
        .catch(() => "invalid" as const);
      return after === "satisfied"
        ? { ok: true, outcome: "VERIFIED" }
        : { ok: false, outcome: "UNKNOWN", code: "POSTCONDITION_UNVERIFIED" };
    } catch (error) {
      const code =
        error instanceof Error && error.message === "PAGE_API_TIMEOUT"
          ? "PAGE_API_TIMEOUT"
          : "PAGE_API_CALL_FAILED";
      return { ok: false, outcome: dispatched ? "UNKNOWN" : "FAILED", code };
    } finally {
      inFlight.delete(key);
      if (dispatched) consumed.add(key);
    }
  };
  return { execute };
};
