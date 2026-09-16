import { createActExecutionRuntime } from "./act-execution-runtime.js";
import { createActPostconditionVerifier } from "./act-postcondition-verifier.js";
import {
  boundedCdp,
  chatRequests,
  chatRunLifecycle,
  executionDiagnostics,
} from "./runtime-lifecycle.js";
import { chromeApi, opaqueId } from "./runtime-platform.js";
import {
  cdpAuthorizedRuns,
  coordinator,
  pageScopes,
  readActiveSnapshot,
  registered,
  registrationKey,
  safeFailure,
} from "./runtime-state.js";

const verifier = createActPostconditionVerifier({
  readAll: (tabId) => readActiveSnapshot("all_dom", tabId),
  send: (tabId, message) => chromeApi!.tabs.sendMessage(tabId, message),
  tab: (tabId) => chromeApi!.tabs.get(tabId),
  scope: (tabId) => pageScopes.get(tabId),
  milestone: (tabId, stage) => executionDiagnostics.actForTab(tabId, stage),
});
export const {
  executeBounded: executeBoundedCdp,
  executeContent: executeActContent,
} = createActExecutionRuntime({
  beforeDispatch: (tabId) => chatRequests.beforeDispatch(tabId),
  verificationStarted: (run) =>
    chatRunLifecycle.publish(run.id, {
      type: "activity_progress",
      stage: "VERIFYING_RESULT",
    }),
  boundedCdp,
  documentFor: (tabId, frameId) =>
    registered.get(registrationKey(tabId, frameId)),
  isRunActive: (runId) => {
    const run = coordinator.runs.byId(runId);
    return !!run && run.phase !== "TERMINAL";
  },
  permitCdp: (runId) => cdpAuthorizedRuns.add(runId),
  revokeCdp: (runId) => cdpAuthorizedRuns.delete(runId),
  createId: opaqueId,
  send: (tabId, message) => chromeApi!.tabs.sendMessage(tabId, message),
  tab: (tabId) => chromeApi!.tabs.get(tabId),
  scope: (tabId) => pageScopes.get(tabId),
  terminal: (run, outcome, code) =>
    coordinator.mutations.terminal(run, outcome, code),
  transition: (runId, phase) => coordinator.runs.transition(runId, phase),
  milestone: (tabId, stage) => executionDiagnostics.actForTab(tabId, stage),
  safeFailure,
  verifier,
});
