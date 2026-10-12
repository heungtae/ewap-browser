import type {
  PageMethodIntent,
  PageMethodResult,
} from "../contracts/page-method-types.js";
import { digestCanonical, opaqueId } from "../security/canonical.js";
import { withDeadline } from "../security/deadline.js";
import { ContractError } from "../security/validation.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";
import { invokePageMethodMain } from "./page-method-main.js";
import { discoverPageMethods } from "./page-method-discovery-runner.js";
import {
  pageMethodApprovalDigest,
  type Dependencies,
  type Injection,
} from "./page-method-runner-contract.js";
export { pageMethodApprovalDigest } from "./page-method-runner-contract.js";

export const createPageMethodRunner = (deps: Dependencies) => {
  const registryKey = `__contextPilotMethods_${opaqueId()}`;
  const consumedBySignal = new WeakMap<AbortSignal, Set<string>>();
  const discover = (tabId: number, documentId: string): Promise<Injection[]> =>
    discoverPageMethods(deps, tabId, documentId, registryKey);
  const execute = async (
    intent: PageMethodIntent,
    context: RequestContext,
  ): Promise<PageMethodResult> => {
    let consumed = consumedBySignal.get(context.signal);
    if (!consumed) {
      consumed = new Set<string>();
      consumedBySignal.set(context.signal, consumed);
    }
    const key = `${context.requestId}:${context.generation}:${intent.run_id}:${intent.invocation_id}`;
    if (consumed.has(key))
      return {
        dispatch: "not_dispatched",
        invocation: "not_started",
        code: "POLICY_DENIED",
      };
    const document = deps.documentFor(intent.tab_id, 0);
    const scope = deps.scope(intent.tab_id);
    const expected = pageMethodApprovalDigest(intent);
    if (
      intent.kind !== "page_method" ||
      typeof intent.invocation_id !== "string" ||
      !intent.invocation_id ||
      !intent.request_id ||
      intent.request_id !== context.requestId ||
      intent.capability !== "page_method" ||
      intent.approval_digest !== expected ||
      intent.request_generation !== context.generation ||
      intent.arguments_digest !== digestCanonical(intent.arguments) ||
      !document ||
      document.documentId !== intent.document_id ||
      document.epoch !== intent.document_epoch ||
      !scope ||
      scope.document_epoch !== intent.document_epoch ||
      scope.page_scope_epoch !== intent.page_scope_epoch ||
      intent.method.object_path.length < 1 ||
      intent.method.object_path.length > 4 ||
      intent.arguments.length > 32
    )
      return {
        dispatch: "not_dispatched",
        invocation: "not_started",
        code: "PAGE_SCOPE_STALE",
      };
    const check = () => {
      assertRequestActive(context);
      const current = deps.documentFor(intent.tab_id, 0);
      const currentScope = deps.scope(intent.tab_id);
      if (
        context.tabId !== intent.tab_id ||
        current?.documentId !== intent.document_id ||
        current.epoch !== intent.document_epoch ||
        currentScope?.document_epoch !== intent.document_epoch ||
        currentScope.page_scope_epoch !== intent.page_scope_epoch
      )
        throw new ContractError("PAGE_SCOPE_STALE");
    };
    let dispatch: PageMethodResult["dispatch"] = "not_dispatched";
    try {
      check();
      const candidate = await discover(intent.tab_id, intent.document_id);
      check();
      const matched =
        candidate.length === 1 &&
        candidate[0]?.frameId === 0 &&
        candidate[0]?.documentId === intent.document_id &&
        Array.isArray(candidate[0].result) &&
        (candidate[0].result as Array<Record<string, unknown>>).some(
          (item) =>
            digestCanonical(item) ===
            digestCanonical({
              object_path: intent.method.object_path,
              method_name: intent.method.method_name,
              arity: intent.method.arity,
              function_kind: intent.method.function_kind,
              locator_revision: intent.method.locator_revision,
            }),
        );
      if (!matched)
        return {
          dispatch,
          invocation: "not_started",
          code: "PAGE_SCOPE_STALE",
        };
      await deps.beforeDispatch(intent.tab_id, context);
      check();
      if (consumed.has(key)) throw new ContractError("POLICY_DENIED");
      consumed.add(key);
      dispatch = "unknown";
      const injected = await withDeadline(
        deps.scripting!.executeScript({
          target: { tabId: intent.tab_id, documentIds: [intent.document_id] },
          world: "MAIN",
          func: invokePageMethodMain as never,
          args: [
            intent.method.object_path,
            intent.method.locator_revision,
            intent.method.method_name,
            intent.method.arity,
            intent.arguments,
            registryKey,
          ],
        }),
        10_000,
        "PAGE_API_TIMEOUT",
      );
      check();
      if (
        injected.length !== 1 ||
        injected[0]?.frameId !== 0 ||
        injected[0]?.documentId !== intent.document_id
      )
        return {
          dispatch: "unknown",
          invocation: "unknown",
          code: "PAGE_SCOPE_STALE",
        };
      const result = injected[0]
        .result as import("../contracts/page-method-types.js").MainPageMethodOutcome;
      if (result?.status === "returned") {
        dispatch = "dispatched";
        return {
          dispatch,
          invocation: "returned",
          return_data: {
            available: true,
            value: result.value,
            kind: result.kind,
            unsupported: result.unsupported,
            ...(result.truncated === undefined
              ? {}
              : { truncated: result.truncated }),
          },
        };
      }
      if (result?.status === "threw") {
        dispatch = "dispatched";
        return { dispatch, invocation: "threw", code: "PAGE_API_CALL_FAILED" };
      }
      dispatch = "not_dispatched";
      return { dispatch, invocation: "not_started", code: "PAGE_SCOPE_STALE" };
    } catch (error) {
      const code =
        error instanceof ContractError
          ? error.code
          : error instanceof Error && error.message === "PAGE_API_TIMEOUT"
            ? "PAGE_API_TIMEOUT"
            : "PAGE_API_CALL_FAILED";
      return {
        dispatch: dispatch === "unknown" ? "unknown" : dispatch,
        invocation:
          dispatch === "unknown"
            ? error instanceof Error && error.message === "PAGE_API_TIMEOUT"
              ? "timed_out"
              : "unknown"
            : "not_started",
        code,
      };
    }
  };
  return { discover, execute };
};
