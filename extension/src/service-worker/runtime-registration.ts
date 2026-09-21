import { createDomainMessageRouter } from "./domain-message-router.js";
import { createRuntimeMessageRouter } from "./runtime-message-router.js";
import {
  actDomainHandlers,
  mutationExecutionMessageHandler,
} from "./runtime-act-handlers.js";
import {
  chatMessageHandler,
  coreMessageHandlers,
  pageLifecycleMessageHandler,
} from "./runtime-core-handlers.js";
import { panelPortLifecycle } from "./runtime-lifecycle.js";
import {
  chromeApi,
  enterprisePolicy,
  pageSenderContext,
} from "./runtime-platform.js";
import { safeFailure } from "./runtime-state.js";
import { startStorage, storageReady } from "./runtime-storage.js";
import {
  previewMessageHandler,
  workflowAnalysisMessageHandler,
  workflowCatalogMessageHandler,
  workflowDismissMessageHandler,
  workflowRecordStartMessageHandler,
  workflowRecordStopMessageHandler,
  workflowSaveMessageHandler,
  workflowSelectionMessageHandler,
  workflowStartMessageHandler,
} from "./runtime-workflow-handlers.js";
import { createCollectionReadDomainHandler } from "./collection-read-domain-handler.js";
import { createPageApiDiscoveryDomainHandler } from "./page-api-discovery-domain-handler.js";
import { createDiscoveryController } from "../page-api/discovery/discovery-controller.js";
import {
  localPageProfile,
  permissions,
  permissionRequests,
  pageScopes,
  registered,
  registrationKey,
} from "./runtime-state.js";

export const registerServiceWorker = (): void => {
  startStorage();
  chromeApi?.tabs.onActivated?.addListener(({ tabId, windowId }) => {
    panelPortLifecycle.notifyTabActivation(tabId, windowId);
  });
  const { profile, preferences, provider, runControl } = coreMessageHandlers;
  const { review, start } = actDomainHandlers;
  const collectionReadHandler = createCollectionReadDomainHandler({
    chrome: chromeApi!,
    permissions,
    requests: permissionRequests,
    activeTabForBoundPanel: pageSenderContext.activeTabForBoundPanel,
    documentFor: (tabId) => registered.get(registrationKey(tabId, 0)),
    scopeFor: (tabId) => pageScopes.get(tabId),
    isPanelSender: pageSenderContext.isPanelSender,
    isPanelOrSettingsSender: pageSenderContext.isPanelOrSettingsSender,
    safeFailure,
  });
  const pageApiDiscovery = createDiscoveryController({
    scripting: chromeApi?.scripting,
    documentFor: (tabId) => registered.get(registrationKey(tabId, 0)),
    scopeFor: (tabId) => pageScopes.get(tabId),
  });
  const pageApiDiscoveryHandler = createPageApiDiscoveryDomainHandler({
    activeTabForBoundPanel: pageSenderContext.activeTabForBoundPanel,
    isPanelSender: pageSenderContext.isPanelSender,
    documentFor: (tabId) => registered.get(registrationKey(tabId, 0)),
    scopeFor: (tabId) => pageScopes.get(tabId),
    authorize: async ({ tabId, documentEpoch, origin }) =>
      enterprisePolicy
        .authorize({
          run_id: crypto.randomUUID(),
          tab_id: tabId,
          document_epoch: documentEpoch,
          origin,
          capability: "page_api",
          risk: "R0",
          profile: localPageProfile,
        })
        .then((decision) => decision.decision === "ALLOW")
        .catch(() => false),
    start: pageApiDiscovery.start,
    cancel: pageApiDiscovery.cancel,
    safeFailure,
  });
  const routeDomain = createDomainMessageRouter({
    handlers: [
      pageLifecycleMessageHandler,
      profile,
      preferences,
      provider,
      runControl,
      review,
      workflowCatalogMessageHandler,
      workflowAnalysisMessageHandler,
      workflowSaveMessageHandler,
      workflowSelectionMessageHandler,
      previewMessageHandler,
      mutationExecutionMessageHandler,
      workflowRecordStartMessageHandler,
      workflowDismissMessageHandler,
      workflowStartMessageHandler,
      workflowRecordStopMessageHandler,
      start,
      collectionReadHandler,
      pageApiDiscoveryHandler,
    ],
    safeFailure,
  });
  chromeApi?.runtime.onMessage.addListener(
    createRuntimeMessageRouter({
      isPanelSender: pageSenderContext.isPanelSender,
      storageReady: () => storageReady,
      safeFailure,
      chatRoute: chatMessageHandler,
      routeDomain,
    }),
  );
};
