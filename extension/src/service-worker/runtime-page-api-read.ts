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
  context: RequestContext,
) => {
  assertRequestActive(context);
  if (binding.run_id !== context.requestId || binding.tab_id !== context.tabId)
    return { ok: false as const, code: "PAGE_SCOPE_STALE" as const };
  const result = await pageApiReadRuntime.read(binding, context.signal);
  assertRequestActive(context);
  return result;
};
