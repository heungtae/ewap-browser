import { validateAgentPreferences } from "../policy/permission-mode.js";
import { ContractError } from "../security/validation.js";
import { withDeadline } from "../security/deadline.js";
import { createChatMessageHandler } from "./chat-message-handler.js";
import { createCoreMessageHandlers } from "./core-message-handlers.js";
import { createPageLifecycleMessageHandler } from "./page-lifecycle-message-handler.js";
import {
  runActChat,
  runAskChat,
  actSessions,
  workflowSelections,
} from "./runtime-chat.js";
import {
  chatRunLifecycle,
  chatRequests,
  executionDiagnostics,
  providerRuntime,
} from "./runtime-lifecycle.js";
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
chatRequests.validateDocument = (tabId, epoch) =>
  registered.get(registrationKey(tabId, 0))?.epoch === epoch;
chatRequests.onTerminal = (tabId, outcome, code) => {
  const run = coordinator.runs.get(tabId);
  if (run && run.phase !== "TERMINAL") {
    coordinator.runs.terminal(run.id, outcome, code);
    if (chatEvents.has(run.id) && !chatEvents.terminal(run.id))
      chatRunLifecycle.publish(run.id, {
        type: "run_terminal",
        outcome,
        ...(code ? { code } : {}),
      });
  }
  for (const [id, session] of actSessions)
    if (session.tabId === tabId) {
      permissions.endRun(id);
      actSessions.delete(id);
    }
  for (const [id, selection] of workflowSelections.values)
    if (selection.tabId === tabId) workflowSelections.values.delete(id);
};
chatRunLifecycle.setTerminalObserver((tabId, outcome) =>
  chatRequests.endTab(tabId, outcome),
);
chatRunLifecycle.setActivityObserver((tabId, stage) => {
  if (
    stage === "PREPARING_PAGE" ||
    stage === "RESOLVING_PROFILE" ||
    stage === "DISCOVERING_WORKFLOWS" ||
    stage === "CONTACTING_PROVIDER" ||
    stage === "VERIFYING_RESULT" ||
    stage === "AWAITING_REVIEW" ||
    stage === "SELECTION_REQUIRED" ||
    stage === "COMPLETED" ||
    stage === "FAILED"
  )
    chatRequests.progress(tabId, stage);
});
export const chatMessageHandler = createChatMessageHandler({
  activeTabForBoundPanel: async (sender) => {
    const active = await pageSenderContext.activeTabForBoundPanel(sender);
    if (!registered.has(registrationKey(active.id, 0)))
      await withDeadline(
        chromeApi!.tabs.sendMessage(active.id, {
          kind: "CONTENT_DOCUMENT_CONTEXT",
        }),
        5_000,
        "DOCUMENT_NOT_REGISTERED",
      ).catch(() => {
        throw new ContractError("DOCUMENT_NOT_REGISTERED");
      });
    const epoch = registered.get(registrationKey(active.id, 0))?.epoch;
    if (!epoch) throw new ContractError("DOCUMENT_NOT_REGISTERED");
    return { ...active, epoch };
  },
  activeTabForPanel: pageSenderContext.activeTabForPanel,
  cancelActiveTab(tabId) {
    coordinator.cancel(tabId);
  },
  chatEvents,
  chatPersistence: chatRunLifecycle.persistence,
  clearScheduledChatPersistence: chatRunLifecycle.clearScheduled,
  diagnostics: executionDiagnostics,
  providerDiagnostics: () =>
    providerRuntime?.diagnostics() ?? Promise.resolve({ configured: false }),
  isPanelSender: pageSenderContext.isPanelSender,
  providerAvailable: () => !!providerRuntime,
  requests: chatRequests,
  runActChat,
  runAskChat,
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
