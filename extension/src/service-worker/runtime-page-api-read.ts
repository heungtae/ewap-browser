import { createAnalysisApiAvailability } from "./analysis-api-availability.js";
import { fixturePageApiReadAdapter as adapter } from "../page-api/read-adapter.js";
import type { ActivePage } from "./page-context-runtime.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";
import {
  createPageApiReadRunner,
  type PageApiReadBinding,
} from "./page-api-read-runner.js";
import { chromeApi, enterprisePolicy } from "./runtime-platform.js";
import {
  localPageProfile,
  pageScopes,
  permissions,
  readActiveSnapshot,
  registered,
  registrationKey,
} from "./runtime-state.js";

/** Internal S13 acquisition entrypoint; no candidate-ref/runtime-message route. */
const pageApiReadRuntime = createPageApiReadRunner({
  scripting: {
    executeScript: (input) =>
      chromeApi?.scripting?.executeScript(input) ??
      Promise.reject(new Error("unavailable")),
  },
  current: async (tabId) => {
    const active = await readActiveSnapshot("all_dom", tabId);
    const document = registered.get(registrationKey(tabId, 0));
    const scope = pageScopes.get(tabId);
    if (
      !document ||
      !scope ||
      active.snapshot.document_epoch !== document.epoch
    )
      return;
    return {
      document_id: document.documentId,
      document_epoch: document.epoch,
      page_scope_epoch: scope.page_scope_epoch,
      origin: active.origin,
      path: active.path,
    };
  },
  authorize: async (binding, capability, risk) => {
    if (
      permissions.check(capability, binding.origin, binding.run_id) !== "ALLOW"
    )
      return false;
    const decision = await enterprisePolicy.authorize({
      run_id: binding.run_id,
      tab_id: binding.tab_id,
      document_epoch: binding.document_epoch,
      origin: binding.origin,
      capability,
      risk,
      profile: localPageProfile,
    });
    return (
      decision.decision === "ALLOW" &&
      permissions.check(capability, binding.origin, binding.run_id) === "ALLOW"
    );
  },
});

/** Caller owns source selection and permission-resume before starting this read. */
export const readPageApiSource = async (
  binding: PageApiReadBinding,
  context?: RequestContext,
) => {
  assertRequestActive(context);
  if (
    !context ||
    binding.run_id !== context.requestId ||
    binding.tab_id !== context.tabId
  )
    return { ok: false as const, code: "PAGE_SCOPE_STALE" as const };
  const result = await pageApiReadRuntime.read(binding, context.signal);
  assertRequestActive(context);
  return result;
};

/** Only the reviewed bundle registry can create callable analysis sources. */
export const pageApiAnalysisSource = (
  active: ActivePage,
  runId: string,
): PageApiReadBinding | undefined => {
  if (active.origin !== adapter.origin || active.path !== adapter.path) return;
  const document = registered.get(registrationKey(active.tabId, 0));
  const scope = pageScopes.get(active.tabId);
  if (
    !document ||
    !scope ||
    document.epoch !== active.snapshot.document_epoch ||
    scope.document_epoch !== document.epoch
  )
    return;
  return {
    run_id: runId,
    tab_id: active.tabId,
    document_id: document.documentId,
    document_epoch: document.epoch,
    page_scope_epoch: scope.page_scope_epoch,
    origin: active.origin,
    path: active.path,
    adapter_id: adapter.adapter_id,
    adapter_version: adapter.version,
    option_id: "summary",
  };
};

export const requiresAnalysisAdapterReview = createAnalysisApiAvailability({
  scripting: chromeApi?.scripting,
  documentFor: (tabId) => registered.get(registrationKey(tabId, 0)),
  scopeFor: (tabId) => pageScopes.get(tabId),
  authorize: async (active, runId) =>
    (
      await enterprisePolicy.authorize({
        run_id: runId,
        tab_id: active.tabId,
        document_epoch: active.snapshot.document_epoch,
        origin: active.origin,
        capability: "page_api",
        risk: "R0",
        profile: localPageProfile,
      })
    ).decision === "ALLOW",
});
