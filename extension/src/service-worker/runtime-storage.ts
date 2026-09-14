import {
  defaultAgentPreferences,
  validateAgentPreferences,
} from "../policy/permission-mode.js";
import { bootstrapStorage } from "./storage-bootstrap.js";
import { workflowSelections } from "./runtime-chat.js";
import { chromeApi } from "./runtime-platform.js";
import { chatRequests, executionDiagnostics } from "./runtime-lifecycle.js";
import {
  chatEvents,
  coordinator,
  permissions,
  agentPreferences,
  setAgentPreferences,
} from "./runtime-state.js";

export let storageReady = false;
export const initialiseStorage = (): Promise<void> =>
  bootstrapStorage({
    chrome: chromeApi,
    permissions,
    restoreChat: (value) => chatEvents.restore(value),
    restoreWorkflowSelections: workflowSelections.restore,
    preferences: () => agentPreferences,
    setPreferences: setAgentPreferences,
    defaultPreferences: defaultAgentPreferences,
    validatePreferences: validateAgentPreferences,
  });
export const startStorage = (): void => {
  void initialiseStorage()
    .then(async () => {
      await executionDiagnostics.restore();
      await chatRequests.restore();
      storageReady = true;
      coordinator.completeStorageBootstrap(true);
    })
    .catch(() => {
      storageReady = false;
      coordinator.completeStorageBootstrap(false);
    });
};
