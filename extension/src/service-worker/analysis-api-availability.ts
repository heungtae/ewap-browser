import { createDiscoveryController } from "../page-api/discovery/discovery-controller.js";
import type { BrowserScripting } from "./browser-api.js";
import type { ActivePage } from "./page-context-runtime.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";

type Dependencies = {
  scripting?: BrowserScripting | undefined;
  documentFor(tabId: number): { epoch: string; documentId: string } | undefined;
  scopeFor(
    tabId: number,
  ): { document_epoch: string; page_scope_epoch: string } | undefined;
  authorize(active: ActivePage, runId: string): Promise<boolean>;
};

/** Discovery only answers availability; no hint/ref/function reaches acquisition authority. */
export const createAnalysisApiAvailability = (dependencies: Dependencies) => {
  const discovery = createDiscoveryController(dependencies);
  return async (
    active: ActivePage,
    runId: string,
    context?: RequestContext,
  ): Promise<boolean> => {
    assertRequestActive(context);
    const document = dependencies.documentFor(active.tabId);
    const scope = dependencies.scopeFor(active.tabId);
    if (
      !document ||
      !scope ||
      document.epoch !== active.snapshot.document_epoch ||
      scope.document_epoch !== document.epoch
    )
      return false;
    if (!(await dependencies.authorize(active, runId).catch(() => false)))
      return false;
    assertRequestActive(context);
    const cancel = () => discovery.cancel(active.tabId);
    context?.signal.addEventListener("abort", cancel, { once: true });
    try {
      const result = await discovery.start({
        tabId: active.tabId,
        documentId: document.documentId,
        documentEpoch: document.epoch,
        pageScopeEpoch: scope.page_scope_epoch,
      });
      assertRequestActive(context);
      return result.terminal === "COMPLETED" && result.candidates.length > 0;
    } finally {
      context?.signal.removeEventListener("abort", cancel);
    }
  };
};
