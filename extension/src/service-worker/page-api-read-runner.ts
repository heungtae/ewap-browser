import {
  fixturePageApiReadAdapter as adapter,
  readFixturePageApi,
  validatePageApiReadResult,
  type PageApiReadContext,
} from "../page-api/read-adapter.js";
import { ContractError } from "../security/validation.js";
import { withDeadline } from "../security/deadline.js";

export type PageApiReadBinding = {
  run_id: string;
  tab_id: number;
  document_id: string;
  document_epoch: string;
  page_scope_epoch: string;
  origin: string;
  path: string;
  adapter_id: string;
  adapter_version: number;
  option_id: string;
};
type Failure = {
  ok: false;
  code:
    | "POLICY_DENIED"
    | "PAGE_SCOPE_STALE"
    | "PAGE_API_UNAVAILABLE"
    | "PAGE_API_CONTRACT_INVALID"
    | "PAGE_API_CALL_FAILED"
    | "PAGE_API_TIMEOUT"
    | "REQUEST_CANCELLED";
};
export type PageApiReadResult =
  | { ok: true; context: PageApiReadContext }
  | Failure;
type Dependencies = {
  scripting: {
    executeScript(input: {
      target: { tabId: number; documentIds: string[] };
      world: "MAIN";
      func: (...args: never[]) => unknown;
      args: unknown[];
    }): Promise<{ frameId?: number; documentId?: string; result?: unknown }[]>;
  };
  current(tabId: number):
    | {
        document_id: string;
        document_epoch: string;
        page_scope_epoch: string;
        origin: string;
        path: string;
      }
    | undefined
    | Promise<
        | {
            document_id: string;
            document_epoch: string;
            page_scope_epoch: string;
            origin: string;
            path: string;
          }
        | undefined
      >;
  /** Must intersect local R0 page_api_read permission with enterprise policy. */
  authorize(
    binding: PageApiReadBinding,
    capability: "page_api_read",
    risk: "R0",
  ): Promise<boolean>;
};

/** Internal acquisition contract; no Discovery reference or Provider argument is accepted. */
export const createPageApiReadRunner = (dependencies: Dependencies) => {
  const consumed = new Set<string>();
  const matches = async (binding: PageApiReadBinding) => {
    const current = await dependencies.current(binding.tab_id);
    return (
      !!current &&
      [
        "document_id",
        "document_epoch",
        "page_scope_epoch",
        "origin",
        "path",
      ].every(
        (key) =>
          current[key as keyof typeof current] ===
          binding[key as keyof PageApiReadBinding],
      )
    );
  };
  return {
    read: async (
      binding: PageApiReadBinding,
      signal?: AbortSignal,
    ): Promise<PageApiReadResult> => {
      const key = `${binding.run_id}:${binding.tab_id}:${binding.adapter_id}`;
      if (consumed.has(key) || consumed.size >= 256)
        return { ok: false, code: "POLICY_DENIED" };
      if (
        Object.keys(binding).some(
          (key) =>
            ![
              "run_id",
              "tab_id",
              "document_id",
              "document_epoch",
              "page_scope_epoch",
              "origin",
              "path",
              "adapter_id",
              "adapter_version",
              "option_id",
            ].includes(key),
        ) ||
        !Number.isSafeInteger(binding.tab_id) ||
        binding.tab_id < 0 ||
        [
          binding.run_id,
          binding.document_id,
          binding.document_epoch,
          binding.page_scope_epoch,
        ].some(
          (value) =>
            typeof value !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value),
        ) ||
        binding.adapter_id !== adapter.adapter_id ||
        binding.adapter_version !== adapter.version ||
        binding.origin !== adapter.origin ||
        binding.path !== adapter.path ||
        binding.option_id !== "summary"
      )
        return { ok: false, code: "PAGE_API_UNAVAILABLE" };
      consumed.add(key);
      const started = Date.now();
      const remaining = () => Math.max(0, 5_000 - (Date.now() - started));
      const check = async () => {
        if (signal?.aborted) return "REQUEST_CANCELLED" as const;
        const current = await withDeadline(
          matches(binding),
          remaining(),
          "PAGE_API_TIMEOUT",
        );
        if (signal?.aborted) return "REQUEST_CANCELLED" as const;
        return current ? undefined : ("PAGE_SCOPE_STALE" as const);
      };
      try {
        const initial = await check();
        if (initial) return { ok: false, code: initial };
        if (
          !(await withDeadline(
            dependencies
              .authorize(binding, "page_api_read", "R0")
              .catch(() => false),
            remaining(),
            "PAGE_API_TIMEOUT",
          ))
        )
          return { ok: false, code: "POLICY_DENIED" };
        const before = await check();
        if (before) return { ok: false, code: before };
        const results = await withDeadline(
          dependencies.scripting.executeScript({
            target: {
              tabId: binding.tab_id,
              documentIds: [binding.document_id],
            },
            world: "MAIN",
            func: readFixturePageApi as never,
            args: [binding.option_id],
          }),
          remaining(),
          "PAGE_API_TIMEOUT",
        );
        const after = await check();
        if (after) return { ok: false, code: after };
        const only = results.length === 1 ? results[0] : undefined;
        if (
          !only ||
          only.frameId !== 0 ||
          only.documentId !== binding.document_id
        )
          return { ok: false, code: "PAGE_SCOPE_STALE" };
        const context = validatePageApiReadResult(only.result);
        return context
          ? { ok: true, context }
          : { ok: false, code: "PAGE_API_CONTRACT_INVALID" };
      } catch (error) {
        return {
          ok: false,
          code: signal?.aborted
            ? "REQUEST_CANCELLED"
            : error instanceof ContractError &&
                error.code === "PAGE_API_TIMEOUT"
              ? "PAGE_API_TIMEOUT"
              : "PAGE_API_CALL_FAILED",
        };
      }
    },
  };
};
