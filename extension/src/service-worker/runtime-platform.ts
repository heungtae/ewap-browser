import { opaqueId } from "../security/canonical.js";
import { CoreProviderTransport } from "../providers/transport.js";
import { createOffscreenProviderBridge } from "./offscreen-provider-bridge.js";
import { ContentScriptRecovery } from "./content-script-recovery.js";
import { createPageSenderContext } from "./page-sender-context.js";
import { createWorkflowCatalogRuntime } from "./workflow-catalog-runtime.js";
import { createWorkflowSourceAnalysis } from "./workflow-source-analysis.js";
import type { BrowserChromeApi } from "./browser-api.js";

export const chromeApi = (
  globalThis as typeof globalThis & { chrome?: BrowserChromeApi }
).chrome;
export const pageSenderContext = createPageSenderContext(chromeApi);
export const providerBridge = createOffscreenProviderBridge(
  chromeApi,
  opaqueId,
);
export const contentScriptRecovery = new ContentScriptRecovery(
  chromeApi?.permissions,
  chromeApi?.scripting,
);
export const workflowSourceAnalysis = createWorkflowSourceAnalysis({
  send: (tabId, message) => chromeApi!.tabs.sendMessage(tabId, message),
});
export const workflowCatalogRuntime = createWorkflowCatalogRuntime({
  get: async (key) => chromeApi?.storage.local.get?.(key),
  set: (value) => chromeApi?.storage.local.set?.(value) ?? Promise.resolve(),
  createId: opaqueId,
});
export const providerTransport = new CoreProviderTransport(
  providerBridge.fetch,
);
export { opaqueId };
