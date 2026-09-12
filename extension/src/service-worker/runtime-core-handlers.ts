import { validateAgentPreferences } from "../policy/permission-mode.js";
import { createChatMessageHandler } from "./chat-message-handler.js";
import { createCoreMessageHandlers } from "./core-message-handlers.js";
import { createPageLifecycleMessageHandler } from "./page-lifecycle-message-handler.js";
import { ChatRequestLifecycle } from "./chat-request-lifecycle.js";
import { runActChat, runAskChat } from "./runtime-chat.js";
import { chatRunLifecycle, providerRuntime } from "./runtime-lifecycle.js";
import { chromeApi, pageSenderContext } from "./runtime-platform.js";
import {
  agentPreferences,
  chatEvents,
  coordinator,
  localBindings,
  localSessionBinding,
  permissionRequests,
  permissions,
  planScopes,
  readActiveSnapshot,
  registered,
  registrationKey,
  resolveProfileFor,
  safeFailure,
  setAgentPreferences,
  pageScopes,
  stalePageTabs,
} from "./runtime-state.js";

const resolveActiveProfile = async () => {
  const active = await readActiveSnapshot();
  const resolved = await resolveProfileFor(active);
  return { tabId: active.tabId, profile: resolved.profile };
};
export const chatRequests = new ChatRequestLifecycle();
export const chatMessageHandler = createChatMessageHandler({
  activeTabForBoundPanel: pageSenderContext.activeTabForBoundPanel,
  activeTabForPanel: pageSenderContext.activeTabForPanel,
  cancelActiveTab(tabId) {
    coordinator.cancel(tabId);
  },
  chatEvents,
  chatPersistence: chatRunLifecycle.persistence,
  clearScheduledChatPersistence: chatRunLifecycle.clearScheduled,
  isPanelSender: pageSenderContext.isPanelSender,
  providerAvailable: () => !!providerRuntime,
  requests: chatRequests,
  runActChat: (payload) => runActChat(payload),
  runAskChat: (payload) => runAskChat(payload),
  safeFailure,
});
export const pageLifecycleMessageHandler = createPageLifecycleMessageHandler({
  extensionId: () => chromeApi?.runtime.id,
  registrationKey,
  registered,
  pageScopes,
  stalePageTabs,
  activeRun: (tabId) => coordinator.runs.get(tabId),
  cancelRunForPageChange: chatRunLifecycle.cancelForPageChange,
  safeFailure,
});
export const coreMessageHandlers = createCoreMessageHandlers({
  chrome: chromeApi!,
  coordinator,
  bindings: localBindings,
  localSessions: localSessionBinding,
  permissions,
  requests: permissionRequests,
  planScopes,
  provider: providerRuntime,
  preferences: () => agentPreferences,
  setPreferences: setAgentPreferences,
  validatePreferences: validateAgentPreferences,
  publishCancelled: chatRunLifecycle.publishCancelled,
  isPanelSender: pageSenderContext.isPanelSender,
  isPanelOrSettingsSender: pageSenderContext.isPanelOrSettingsSender,
  isSettingsSender: pageSenderContext.isSettingsSender,
  resolveActiveProfile,
  safeFailure,
});
