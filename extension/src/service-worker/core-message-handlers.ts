import type { AgentPreferences } from "../policy/permission-mode.js";
import type {
  Capability,
  PermissionManager,
} from "../policy/permission-manager.js";
import type { PlanScopeStore } from "../policy/plan-scope.js";
import type { ProviderRuntime } from "../providers/runtime.js";
import type {
  LocalFixtureSessionBinding,
  SessionBinding,
} from "../state/local-session-binding.js";
import type { BrowserChromeApi, BrowserSender } from "./browser-api.js";
import type { ServiceCoordinator } from "./coordinator.js";
import { createPreferencesMessageHandler } from "./preferences-message-handler.js";
import { createProfileMessageHandler } from "./profile-message-handler.js";
import { createProviderMessageHandler } from "./provider-message-handler.js";
import { createRunControlMessageHandler } from "./run-control-message-handler.js";

type PermissionRequest = {
  capability: Capability;
  origin: string;
  expiresAt: number;
  act_session_id?: string;
};
type Dependencies = {
  chrome: BrowserChromeApi;
  coordinator: ServiceCoordinator;
  bindings: Map<string, SessionBinding>;
  localSessions: LocalFixtureSessionBinding;
  permissions: PermissionManager;
  requests: Map<string, PermissionRequest>;
  planScopes: PlanScopeStore;
  provider: ProviderRuntime | undefined;
  preferences(): AgentPreferences;
  setPreferences(value: AgentPreferences): void;
  validatePreferences(value: unknown): AgentPreferences;
  publishCancelled(run: ReturnType<ServiceCoordinator["runs"]["get"]>): void;
  isPanelSender(sender: BrowserSender): boolean;
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  isSettingsSender(sender: BrowserSender): boolean;
  resolveActiveProfile(): Promise<{
    profile: {
      resolution: unknown;
      profile_id?: unknown;
      profile_version?: unknown;
      business_mcp?: unknown[];
    };
  }>;
  safeFailure(code: string, detail?: string): Record<string, unknown>;
};

export const createCoreMessageHandlers = (dependencies: Dependencies) => {
  const cancelActiveRun = async (): Promise<boolean> => {
    const tabs = await dependencies.chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const tabId = tabs[0]?.id;
    if (tabId === undefined) return false;
    const run = dependencies.coordinator.runs.get(tabId);
    if (run) {
      const binding = dependencies.bindings.get(run.id);
      if (binding) dependencies.localSessions.clear(binding.id);
      dependencies.bindings.delete(run.id);
    }
    dependencies.coordinator.cancel(tabId);
    dependencies.publishCancelled(run);
    return true;
  };
  const profile = createProfileMessageHandler({
    isPanelSender: dependencies.isPanelSender,
    isPanelOrSettingsSender: dependencies.isPanelOrSettingsSender,
    resolveActiveProfile: dependencies.resolveActiveProfile,
    safeFailure: dependencies.safeFailure,
  });
  const preferences = createPreferencesMessageHandler({
    isPanelOrSettingsSender: dependencies.isPanelOrSettingsSender,
    isSettingsSender: dependencies.isSettingsSender,
    preferences: dependencies.preferences,
    validatePreferences: dependencies.validatePreferences,
    async savePreferences(value) {
      await dependencies.chrome.storage.local.set?.({
        agent_preferences: value,
      });
      dependencies.setPreferences(value);
    },
    async cancelActiveRun() {
      await cancelActiveRun();
    },
    safeFailure: dependencies.safeFailure,
  });
  const provider = createProviderMessageHandler({
    isPanelOrSettingsSender: dependencies.isPanelOrSettingsSender,
    providerAvailable: () => !!dependencies.provider,
    handleProvider: (kind, payload) =>
      dependencies.provider!.handle(kind, payload),
    safeFailure: dependencies.safeFailure,
  });
  const runControl = createRunControlMessageHandler({
    isPanelSender: dependencies.isPanelSender,
    cancelActiveRun,
    permissionRequest: (id) => dependencies.requests.get(id),
    decidePermission(request, requestId, decision) {
      dependencies.permissions.decide(
        request.capability,
        request.origin,
        request.act_session_id ?? requestId,
        decision,
      );
    },
    async persistPermissions() {
      await dependencies.chrome.storage.local.set?.({
        contextpilot_permissions: dependencies.permissions.snapshot(),
      });
    },
    approvePlan: (runId, origins) =>
      dependencies.planScopes.approve(runId, origins),
    safeFailure: dependencies.safeFailure,
  });
  return { preferences, profile, provider, runControl };
};
