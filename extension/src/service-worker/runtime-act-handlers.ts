import { createActDomainHandlers } from "./act-domain-handlers.js";
import { createFixtureActStart } from "./fixture-act-start.js";
import { createFixtureExecutor } from "./fixture-execution.js";
import { createFixtureMutationMessageHandler } from "./fixture-mutation-message-handler.js";
import {
  confirmActProposal,
  executeActProposal,
  actSessions,
  publishActTerminal,
  submitActValue,
} from "./runtime-chat.js";
import { executeBoundedCdp } from "./runtime-execution.js";
import { chromeApi, opaqueId, pageSenderContext } from "./runtime-platform.js";
import {
  agentPreferences,
  coordinator,
  localBindings,
  localPageProfile,
  localSessionBinding,
  permissionRequests,
  permissions,
  readActiveSnapshot,
  safeFailure,
} from "./runtime-state.js";

const fixtureExecutor = createFixtureExecutor({
  executeBounded: executeBoundedCdp,
  send: (tabId, message) => chromeApi!.tabs.sendMessage(tabId, message),
  terminal: (run, state) => coordinator.mutations.terminal(run, state),
  safeFailure,
});
export const mutationExecutionMessageHandler =
  createFixtureMutationMessageHandler({
    chrome: chromeApi!,
    isPanelSender: pageSenderContext.isPanelSender,
    coordinator,
    bindings: localBindings,
    localSessions: localSessionBinding,
    execute: fixtureExecutor,
    pageOrigin: pageSenderContext.pageOrigin,
    safeFailure,
  });
const startFixtureAct = createFixtureActStart({
  readActive: readActiveSnapshot,
  preferences: () => agentPreferences,
  permissions,
  requests: permissionRequests,
  createId: opaqueId,
  coordinator,
  bindings: localBindings,
  localSessions: localSessionBinding,
  profile: localPageProfile,
  execute: fixtureExecutor,
  safeFailure,
});
export const actDomainHandlers = createActDomainHandlers({
  isPanelSender: pageSenderContext.isPanelSender,
  sessions: actSessions,
  coordinator,
  permissions,
  publishTerminal: publishActTerminal,
  submit: submitActValue,
  confirm: confirmActProposal,
  approve: executeActProposal,
  startFixture: startFixtureAct,
  safeFailure,
});
