import { ProviderRuntime } from "../providers/runtime.js";
import { createBoundedCdpRuntime } from "./bounded-cdp-runtime.js";
import { createChatRunLifecycle } from "./chat-run-lifecycle.js";
import { ExecutionDiagnostics } from "./execution-diagnostics.js";
import { ChatRequestLifecycle } from "./chat-request-lifecycle.js";
import { RequestPersistence } from "./request-persistence.js";
import { createPanelPortLifecycle } from "./panel-port-lifecycle.js";
import { registerTabLifecycle } from "./tab-lifecycle.js";
import {
  chromeApi,
  providerBridge,
  providerTransport,
} from "./runtime-platform.js";
import {
  cdpAuthorizedRuns,
  chatEvents,
  coordinator,
  localBindings,
  localSessionBinding,
  pageScopes,
  stalePageTabs,
  visionCaptures,
} from "./runtime-state.js";

export const panelPortLifecycle = createPanelPortLifecycle({
  chrome: chromeApi,
  handleProvider: (port) => providerBridge.handlePort(port),
});
export const { panelPorts, unboundPanelPorts } = panelPortLifecycle;
panelPortLifecycle.register();
export const providerRuntime =
  chromeApi?.storage.local.get && chromeApi.storage.local.set
    ? new ProviderRuntime(
        {
          get: chromeApi.storage.local.get.bind(chromeApi.storage.local),
          set: chromeApi.storage.local.set.bind(chromeApi.storage.local),
        },
        providerTransport,
      )
    : undefined;
export const { boundedCdp } = createBoundedCdpRuntime({
  chrome: chromeApi,
  authorized: (runId) => cdpAuthorizedRuns.has(runId),
});
export const executionDiagnostics = new ExecutionDiagnostics(
  chromeApi?.storage,
);
export const chatRequests = new ChatRequestLifecycle(
  executionDiagnostics,
  new RequestPersistence(
    chromeApi?.storage.session.get && chromeApi.storage.session.set
      ? {
          get: chromeApi.storage.session.get.bind(chromeApi.storage.session),
          set: chromeApi.storage.session.set.bind(chromeApi.storage.session),
        }
      : undefined,
  ),
);
export const chatRunLifecycle = createChatRunLifecycle({
  chrome: chromeApi,
  events: chatEvents,
  panels: panelPorts,
  unboundPanels: unboundPanelPorts,
  captures: visionCaptures,
  coordinator,
  bindings: localBindings,
  localSessions: localSessionBinding,
  diagnostics: executionDiagnostics,
});
registerTabLifecycle({
  chrome: chromeApi,
  stalePageTabs,
  pageScopes,
  activeRun: (tabId) => coordinator.runs.get(tabId),
  cancelForPageChange: chatRunLifecycle.cancelForPageChange,
  cancel: (tabId) => coordinator.cancel(tabId),
  publishCancelled: chatRunLifecycle.publishCancelled,
  removeChat: (tabId) => chatEvents.removeTab(tabId),
  flushChat: chatRunLifecycle.flush,
});
