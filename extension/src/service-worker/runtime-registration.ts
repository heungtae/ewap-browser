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
import { chromeApi } from "./runtime-platform.js";
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

export const registerServiceWorker = (): void => {
  startStorage();
  chromeApi?.tabs.onActivated?.addListener(({ tabId, windowId }) => {
    panelPortLifecycle.notifyTabActivation(tabId, windowId);
  });
  const { profile, preferences, provider, runControl } = coreMessageHandlers;
  const { review, start } = actDomainHandlers;
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
    ],
    safeFailure,
  });
  chromeApi?.runtime.onMessage.addListener(
    createRuntimeMessageRouter({
      storageReady: () => storageReady,
      safeFailure,
      chatRoute: chatMessageHandler,
      routeDomain,
    }),
  );
};
