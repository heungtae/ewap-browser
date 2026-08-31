import { createActExecutionRuntime } from "./act-execution-runtime.js";
import { createActPostconditionVerifier } from "./act-postcondition-verifier.js";
import { boundedCdp } from "./runtime-lifecycle.js";
import { chromeApi, opaqueId } from "./runtime-platform.js";
import {
  cdpAuthorizedRuns,
  coordinator,
  readActiveSnapshot,
  registered,
  registrationKey,
  safeFailure,
} from "./runtime-state.js";

const verifier = createActPostconditionVerifier({
  readAll: () => readActiveSnapshot("all_dom"),
  send: (tabId, message) => chromeApi!.tabs.sendMessage(tabId, message),
  tab: (tabId) => chromeApi!.tabs.get(tabId),
});
export const {
  executeBounded: executeBoundedCdp,
  executeContent: executeActContent,
} = createActExecutionRuntime({
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
  terminal: (run, outcome) => coordinator.mutations.terminal(run, outcome),
  transition: (runId, phase) => coordinator.runs.transition(runId, phase),
  safeFailure,
  verifier,
});
