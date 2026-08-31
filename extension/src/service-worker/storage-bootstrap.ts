import type { PermissionManager } from "../policy/permission-manager.js";
import type { AgentPreferences } from "../policy/permission-mode.js";
import type { BrowserChromeApi } from "./browser-api.js";

type Dependencies = {
  chrome: BrowserChromeApi | undefined;
  permissions: PermissionManager;
  restoreChat(value: unknown): void;
  restoreWorkflowSelections(): Promise<void>;
  preferences(): AgentPreferences;
  setPreferences(value: AgentPreferences): void;
  defaultPreferences(): AgentPreferences;
  validatePreferences(value: unknown): AgentPreferences;
};

export const bootstrapStorage = async (
  dependencies: Dependencies,
): Promise<void> => {
  const storage = dependencies.chrome?.storage;
  const access = await Promise.allSettled([
    storage?.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    storage?.managed.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
    storage?.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  ]);
  if (access[0]?.status === "rejected") throw access[0].reason;
  const saved = await storage?.local.get?.("contextpilot_permissions");
  const legacy =
    saved?.contextpilot_permissions === undefined
      ? await storage?.local.get?.("wb_permissions")
      : undefined;
  const storedPermissions =
    saved?.contextpilot_permissions ?? legacy?.wb_permissions;
  if (storedPermissions !== undefined) {
    try {
      dependencies.permissions.load(storedPermissions);
    } catch {
      /* malformed grants never widen access */
    }
  }
  const storedPreferences = await storage?.local.get?.("agent_preferences");
  if (storedPreferences?.agent_preferences !== undefined) {
    try {
      dependencies.setPreferences(
        dependencies.validatePreferences(storedPreferences.agent_preferences),
      );
    } catch {
      dependencies.setPreferences(dependencies.defaultPreferences());
    }
  }
  const storedChat = await storage?.session.get?.("chat_session_v1");
  dependencies.restoreChat(storedChat?.chat_session_v1);
  await dependencies.restoreWorkflowSelections();
};
