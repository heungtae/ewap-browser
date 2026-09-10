import { actionView } from "./act-review-presentation.js";
import { createActChatStart } from "./act-chat-start.js";
import { createActProposalExecutor } from "./act-proposal-executor.js";
import type { ActSession } from "./act-session-types.js";
import { createActStepRunner } from "./act-step-runner.js";
import { createAskChatRunner } from "./ask-chat-runner.js";
import {
  askReadTools,
  askSystemPrompt,
  redactedTabTitle,
  serialiseToolResult,
} from "./ask-tools.js";
import { executeActContent } from "./runtime-execution.js";
import { chatRunLifecycle, providerRuntime } from "./runtime-lifecycle.js";
import {
  chromeApi,
  opaqueId,
  enterprisePolicy,
  runtimeEvidence,
  providerBridge,
  workflowCatalogRuntime,
} from "./runtime-platform.js";
import {
  agentPreferences,
  chatEvents,
  chatPageScope,
  coordinator,
  permissionRequests,
  permissions,
  planScopes,
  readActiveSnapshot,
  resolveProfileFor,
  visionCaptures,
} from "./runtime-state.js";
import { createWorkflowSelectionStore } from "./workflow-selection-store.js";
import {
  persistedWorkflowSelection,
  serialiseWorkflowSelection,
} from "./workflow-selection-codec.js";

export const actSessions = new Map<string, ActSession>();
export const activeWorkflowRecordings = new Map<
  string,
  { tabId: number; documentEpoch: string; origin: string; path: string }
>();
export const workflowSelections = createWorkflowSelectionStore({
  get: async (key) => chromeApi?.storage.session.get?.(key),
  set: (value) => chromeApi?.storage.session.set?.(value) ?? Promise.resolve(),
  serialize: serialiseWorkflowSelection,
  deserialize: persistedWorkflowSelection,
  id: (selection) => selection.id,
  expired: (selection, now) => selection.expiresAt < now,
});
export const publishActTerminal = (
  run: Parameters<typeof coordinator.mutations.terminal>[0],
  outcome: "VERIFIED" | "FAILED" | "UNKNOWN" | "CANCELLED",
  code?: string,
): void => {
  if (!chatEvents.has(run.id) || chatEvents.terminal(run.id)) return;
  chatRunLifecycle.publish(run.id, {
    type: "run_terminal",
    outcome,
    ...(code ? { code } : {}),
  });
};
export const runAskChat = createAskChatRunner({
  chrome: chromeApi!,
  coordinator,
  provider: providerRuntime!,
  preferences: () => agentPreferences,
  readActive: readActiveSnapshot,
  resolveProfile: resolveProfileFor,
  threadContext: (tabId) => chatEvents.context(tabId),
  pageScope: chatPageScope,
  bindRun: (runId, tabId, scope) => chatEvents.bindRun(runId, tabId, scope),
  publish: chatRunLifecycle.publish,
  safeFailure: (code) => ({ ok: false, code }),
  askTools: askReadTools,
  systemPrompt: askSystemPrompt,
  serialise: serialiseToolResult,
  redactedTitle: redactedTabTitle,
  providerFetch: providerBridge.fetch,
  vision: (runId, captureId) => visionCaptures.get(`${runId}:${captureId}`),
  rememberVision: chatRunLifecycle.rememberVision,
  releaseVision: chatRunLifecycle.releaseVision,
});
const actStepRunner = createActStepRunner({
  coordinator,
  provider: providerRuntime!,
  preferences: () => agentPreferences,
  readActive: readActiveSnapshot,
  threadContext: (tabId) => chatEvents.context(tabId),
  pageScope: chatPageScope,
  bindRun: (runId, tabId, scope) => chatEvents.bindRun(runId, tabId, scope),
  publish: chatRunLifecycle.publish,
  serialise: serialiseToolResult,
  endSession: (session) => {
    permissions.endRun(session.id);
    actSessions.delete(session.id);
  },
});
export const runActChat = createActChatStart({
  readActive: readActiveSnapshot,
  resolveProfile: resolveProfileFor,
  candidates: workflowCatalogRuntime.collect,
  createId: opaqueId,
  selections: workflowSelections.values,
  persistSelections: workflowSelections.persist,
  sessions: actSessions,
  runStep: actStepRunner.runStep,
});
const proposalExecutor = createActProposalExecutor({
  coordinator,
  permissions,
  preferences: () => agentPreferences,
  authorizeEnterprise: enterprisePolicy.authorize,
  evidence: runtimeEvidence.emit,
  planScopes,
  readActive: readActiveSnapshot,
  getRun: (runId) => coordinator.runs.byId(runId),
  requestPermission: (capability, origin, sessionId) => {
    const requestId = opaqueId();
    permissionRequests.set(requestId, {
      capability,
      origin,
      expiresAt: Date.now() + 60_000,
      act_session_id: sessionId,
    });
    return requestId;
  },
  execute: executeActContent,
  publish: chatRunLifecycle.publish,
  publishTerminal: publishActTerminal,
  actionView,
  continueWorkflow: actStepRunner.continueWorkflow,
  endSession: (session) => {
    permissions.endRun(session.id);
    actSessions.delete(session.id);
  },
});
export const {
  executeProposal: executeActProposal,
  submitValue: submitActValue,
  confirmProposal: confirmActProposal,
} = proposalExecutor;
export const runActStep = actStepRunner.runStep;
