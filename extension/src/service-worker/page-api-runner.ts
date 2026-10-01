import { assertRequestActive, type RequestContext } from "./request-context.js";
import { ContractError } from "../security/validation.js";
import { withDeadline } from "../security/deadline.js";
import type {
  PageApiDispatchResult,
  PageApiIntent,
} from "../contracts/page-api-types.js";
import { pageApiRegistry, type PageApiRegistry } from "../page-api/registry.js";
import {
  invokeFixturePageApi,
  probeFixturePageApi,
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
  beforeDispatch(tabId: number, context: RequestContext): Promise<void>;
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
    context: RequestContext,
  ): Promise<PageApiDispatchResult> => {
    if (
      intent.kind !== "page_api" ||
      intent.capability !== "page_api" ||
      intent.frame_id !== 0 ||
      !Number.isSafeInteger(intent.tab_id) ||
      intent.tab_id < 0
    )
      return {
        ok: false,
        outcome: "FAILED",
        code: "PAGE_API_CONTRACT_INVALID",
      };
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
    if (
      intent.approval_digest !== expectedDigest ||
      intent.completion_digest !==
        pageApiCompletionDigest(found.action.completion)
    )
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
    inFlight.add(key);
    let dispatched = false;
    try {
      const check = () => {
        if (!context) throw new ContractError("POLICY_DENIED");
        assertRequestActive(context);
        if (context && context.tabId !== intent.tab_id)
          throw new ContractError("POLICY_DENIED");
        const document = dependencies.documentFor(intent.tab_id, 0);
        const scope = dependencies.scope(intent.tab_id);
        if (
          document?.documentId !== intent.document_id ||
          document.epoch !== intent.document_epoch ||
          scope?.document_epoch !== intent.document_epoch ||
          scope.page_scope_epoch !== intent.page_scope_epoch
        )
          throw new ContractError("PAGE_SCOPE_STALE");
      };
      check();
      mark(intent, "PAGE_API_PREPARING");
      const probe = await withDeadline(
        dependencies.scripting.executeScript({
          target: { tabId: intent.tab_id, documentIds: [intent.document_id] },
          world: "MAIN",
          func: probeFixturePageApi as never,
          args: [],
        }),
        Math.min(5_000, remaining()),
        "PAGE_API_TIMEOUT",
      );
      check();
      if (
        probe.length !== 1 ||
        probe[0]?.frameId !== 0 ||
        probe[0].documentId !== intent.document_id ||
        probe[0].result !== true
      )
        return { ok: false, outcome: "FAILED", code: "PAGE_API_UNAVAILABLE" };
      const before = await withDeadline(
        dependencies.observe(
          intent,
          optionName,
          found.action.completion,
          remaining(),
        ),
        remaining(),
        "PAGE_API_TIMEOUT",
      );
      check();
      const observedDocument = dependencies.documentFor(intent.tab_id, 0);
      const observedScope = dependencies.scope(intent.tab_id);
      if (
        observedDocument?.documentId !== intent.document_id ||
        observedDocument.epoch !== intent.document_epoch ||
        observedScope?.document_epoch !== intent.document_epoch ||
        observedScope.page_scope_epoch !== intent.page_scope_epoch
      )
        return { ok: false, outcome: "FAILED", code: "PAGE_SCOPE_STALE" };
      if (before === "satisfied")
        return { ok: true, outcome: "ALREADY_SATISFIED" };
      if (before !== "pending" || remaining() === 0)
        return { ok: false, outcome: "FAILED", code: "PAGE_API_UNAVAILABLE" };
      await dependencies.beforeDispatch(intent.tab_id, context);
      check();
      const current = dependencies.documentFor(intent.tab_id, 0);
      const currentScope = dependencies.scope(intent.tab_id);
      if (
        !current ||
        current.epoch !== intent.document_epoch ||
        current.documentId !== intent.document_id ||
        !currentScope ||
        currentScope.document_epoch !== intent.document_epoch ||
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
      check();
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
          outcome: "UNKNOWN",
          code:
            returned === "invalid" || returned === undefined
              ? "PAGE_API_CONTRACT_INVALID"
              : "PAGE_API_CALL_FAILED",
        };
      mark(intent, "VERIFYING_RESULT");
      const after = await withDeadline(
        dependencies.observe(
          intent,
          optionName,
          found.action.completion,
          remaining(),
        ),
        remaining(),
        "PAGE_API_TIMEOUT",
      );
      check();
      const finalDocument = dependencies.documentFor(intent.tab_id, 0);
      const finalScope = dependencies.scope(intent.tab_id);
      if (
        finalDocument?.documentId !== intent.document_id ||
        finalDocument.epoch !== intent.document_epoch ||
        finalScope?.document_epoch !== intent.document_epoch ||
        finalScope.page_scope_epoch !== intent.page_scope_epoch
      )
        return { ok: false, outcome: "UNKNOWN", code: "PAGE_SCOPE_STALE" };
      return after === "satisfied"
        ? { ok: true, outcome: "VERIFIED" }
        : { ok: false, outcome: "UNKNOWN", code: "POSTCONDITION_UNVERIFIED" };
    } catch (error) {
      const code =
        error instanceof ContractError
          ? error.code
          : error instanceof Error && error.message === "PAGE_API_TIMEOUT"
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
