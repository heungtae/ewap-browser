import { qualifyPromptResponses } from "./chrome-panel-responses.mjs";
import { qualifyPromptIsolation } from "./chrome-panel-isolation.mjs";
import { qualifyPanelBounds } from "./chrome-panel-bounds.mjs";
import { panelHarness } from "./panel-harness.mjs";
export async function qualifyPanelGuards(panel) {
  const h = panelHarness(panel);
  await qualifyPromptResponses(panel, h);
  await qualifyPromptIsolation(panel, h);
  await qualifyPanelBounds(panel, h);
  return {
    oneResponsePerPrompt: true,
    exactBindingForwarded: true,
    valuesCleared: true,
    expiredPromptDisabled: true,
    disconnectLocksPrompt: true,
    reconnectNeedsFreshPrompt: true,
    freshConsentAccepted: true,
    unknownResponseLocked: true,
    privateErrorMasked: true,
    lateFailureKeepsNewPrompt: true,
    askCannotApproveAction: true,
    terminalIgnoresLatePrompts: true,
    remountKeepsOneStreamingMessage: true,
    responseTruncationVisible: true,
    transcriptCap: 1000,
    clearWaitsForClient: true,
    startCarriesRequestIdentity: true,
  };
}
