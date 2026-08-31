import { workflowTargetsMatchSnapshot } from "../contracts/workflow.js";
import type { WorkflowCatalogState } from "../contracts/workflow-catalog.js";
import { ContractError } from "../security/validation.js";
import { createPreviewMessageHandler } from "./preview-message-handler.js";
import { createWorkflowAnalysisMessageHandler } from "./workflow-analysis-message-handler.js";
import { createWorkflowCatalogMessageHandler } from "./workflow-catalog-message-handler.js";
import { createWorkflowDismissMessageHandler } from "./workflow-dismiss-message-handler.js";
import { createWorkflowRecordStartMessageHandler } from "./workflow-record-start-message-handler.js";
import { createWorkflowRecordStopMessageHandler } from "./workflow-record-stop-message-handler.js";
import { createWorkflowSaveMessageHandler } from "./workflow-save-message-handler.js";
import { createWorkflowSelectionMessageHandler } from "./workflow-selection-message-handler.js";
import { createWorkflowStartMessageHandler } from "./workflow-start-message-handler.js";
import { workflowAnalysisSystemPrompt } from "./workflow-source-analysis.js";
import {
  activeWorkflowRecordings,
  actSessions,
  runActStep,
  workflowSelections,
} from "./runtime-chat.js";
import { providerRuntime } from "./runtime-lifecycle.js";
import {
  chromeApi,
  opaqueId,
  pageSenderContext,
  workflowCatalogRuntime,
  workflowSourceAnalysis,
} from "./runtime-platform.js";
import {
  coordinator,
  readActiveSnapshot,
  safeFailure,
} from "./runtime-state.js";
import { createWorkflowSessionActions } from "./workflow-session-actions.js";

const workflowActions = createWorkflowSessionActions({
  selections: workflowSelections.values,
  persist: workflowSelections.persist,
  sessions: actSessions,
  createId: opaqueId,
  runStep: runActStep,
  safeFailure,
});
export const workflowCatalogMessageHandler =
  createWorkflowCatalogMessageHandler({
    isPanelOrSettingsSender: pageSenderContext.isPanelOrSettingsSender,
    isSettingsSender: pageSenderContext.isSettingsSender,
    loadCatalog: workflowCatalogRuntime.load,
    saveCatalog: (catalog) =>
      workflowCatalogRuntime.save(catalog as WorkflowCatalogState),
    safeFailure,
  });
export const workflowAnalysisMessageHandler =
  createWorkflowAnalysisMessageHandler({
    isPanelSender: pageSenderContext.isPanelSender,
    selection: workflowSelections.selection,
    preview: workflowSourceAnalysis.preview,
    active: readActiveSnapshot,
    source: async (selection) =>
      workflowSourceAnalysis.source(
        await workflowSourceAnalysis.preview(
          selection.tabId,
          selection.documentEpoch,
        ),
      ),
    chat: (request) => {
      if (!providerRuntime) throw new ContractError("PROVIDER_UNAVAILABLE");
      return providerRuntime.chat(request);
    },
    parse: workflowSourceAnalysis.parse,
    targetsMatch: workflowTargetsMatchSnapshot,
    candidate: (declaration, active) =>
      workflowCatalogRuntime.runtimeCandidate(
        declaration,
        active,
        "code-analysis",
      ),
    save: async (selection, candidate) => {
      const current = workflowSelections.selection(selection.id);
      if (!current) throw new ContractError("WORKFLOW_STATE_MISMATCH");
      current.candidates.set(candidate.candidate.id, candidate);
      await workflowSelections.persist();
    },
    systemPrompt: workflowAnalysisSystemPrompt,
    safeFailure,
  });
export const workflowSaveMessageHandler = createWorkflowSaveMessageHandler({
  isPanelSender: pageSenderContext.isPanelSender,
  selection: workflowSelections.selection,
  active: readActiveSnapshot,
  record: workflowCatalogRuntime.record,
  safeFailure,
});
export const workflowSelectionMessageHandler =
  createWorkflowSelectionMessageHandler({
    isPanelSender: pageSenderContext.isPanelSender,
    selection: workflowSelections.selection,
    active: readActiveSnapshot,
    persist: workflowSelections.persist,
    safeFailure,
  });
export const previewMessageHandler = createPreviewMessageHandler({
  isPanelSender: pageSenderContext.isPanelSender,
  active: readActiveSnapshot,
  preview: (active) =>
    coordinator.preview(
      active.tabId,
      0,
      active.snapshot.document_epoch,
      active.origin,
      active.snapshot,
    ),
  safeFailure,
});
export const workflowRecordStartMessageHandler =
  createWorkflowRecordStartMessageHandler({
    isPanelSender: pageSenderContext.isPanelSender,
    active: readActiveSnapshot,
    createId: opaqueId,
    send: (tabId, message) => chromeApi!.tabs.sendMessage(tabId, message),
    recordings: activeWorkflowRecordings,
    safeFailure,
  });
export const workflowDismissMessageHandler =
  createWorkflowDismissMessageHandler({
    isPanelSender: pageSenderContext.isPanelSender,
    selection: workflowSelections.selection,
    active: readActiveSnapshot,
    dismiss: (selection, active, respond) =>
      workflowActions.dismiss(
        selection as Parameters<typeof workflowActions.dismiss>[0],
        active,
        respond,
      ),
    safeFailure,
  });
export const workflowStartMessageHandler = createWorkflowStartMessageHandler({
  isPanelSender: pageSenderContext.isPanelSender,
  selection: workflowSelections.selection,
  active: readActiveSnapshot,
  start: (selection, candidate, respond) =>
    workflowActions.start(
      selection as Parameters<typeof workflowActions.start>[0],
      candidate,
      respond,
    ),
  safeFailure,
});
export const workflowRecordStopMessageHandler =
  createWorkflowRecordStopMessageHandler({
    isPanelSender: pageSenderContext.isPanelSender,
    recordings: activeWorkflowRecordings,
    send: (tabId, message) => chromeApi!.tabs.sendMessage(tabId, message),
    createId: opaqueId,
    active: readActiveSnapshot,
    record: workflowCatalogRuntime.record,
    safeFailure,
  });
