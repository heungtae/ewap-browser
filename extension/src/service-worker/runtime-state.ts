import {
  defaultAgentPreferences,
  type AgentPreferences,
} from "../policy/permission-mode.js";
import {
  PermissionManager,
  type Capability,
} from "../policy/permission-manager.js";
import { PlanScopeStore } from "../policy/plan-scope.js";
import {
  LocalFixtureSessionBinding,
  type SessionBinding,
} from "../state/local-session-binding.js";
import { TabChatSessionStore } from "../state/tab-chat-session-store.js";
import type { VisionCapture } from "./vision-capture.js";
import { ServiceCoordinator } from "./coordinator.js";
import { createPageContextRuntime } from "./page-context-runtime.js";
import {
  chromeApi,
  contentScriptRecovery,
  pageSenderContext,
} from "./runtime-platform.js";

export type RegisteredDocument = { epoch: string; documentId: string };
export const registered = new Map<string, RegisteredDocument>();
export const registrationKey = (tabId: number, frameId: number): string =>
  `${tabId}:${frameId}`;
export const safeFailure = (code: string, detail?: string) => ({
  ok: false,
  code,
  ...(detail ? { detail } : {}),
});
export const allWebPages = "<all_urls>";
export const localPageProfile = { id: "local-page-ui-v1", version: 1 };
export const localSessionBinding = new LocalFixtureSessionBinding();
export const localBindings = new Map<string, SessionBinding>();
export const permissions = new PermissionManager();
export const cdpAuthorizedRuns = new Set<string>();
export const chatEvents = new TabChatSessionStore();
export const pageScopes = new Map<
  number,
  { document_epoch: string; page_scope_epoch: string }
>();
export const stalePageTabs = new Set<number>();
export const planScopes = new PlanScopeStore();
export const visionCaptures = new Map<string, VisionCapture>();
export const permissionRequests = new Map<
  string,
  {
    capability: Capability;
    origin: string;
    expiresAt: number;
    act_session_id?: string;
  }
>();
export const coordinator = new ServiceCoordinator({
  permission_origins: [allWebPages],
  page_read_origins: [allWebPages],
  profile_resolver_origins: [],
  llm_egress_origins: [],
});
export let agentPreferences: AgentPreferences = defaultAgentPreferences();
export const setAgentPreferences = (value: AgentPreferences): void => {
  agentPreferences = value;
};
export const pageContextRuntime = createPageContextRuntime({
  chrome: chromeApi,
  defaultScope: () => agentPreferences.default_read_scope,
  isRegistered: (tabId, epoch) =>
    registered.get(registrationKey(tabId, 0))?.epoch === epoch,
  pageOrigin: pageSenderContext.pageOrigin,
  recovery: contentScriptRecovery,
  scopeFor: (tabId, epoch) => {
    const known = pageScopes.get(tabId);
    return known?.document_epoch === epoch ? known.page_scope_epoch : undefined;
  },
});
export const readActiveSnapshot = pageContextRuntime.read;
export const resolveProfileFor = pageContextRuntime.resolveProfile;
export const chatPageScope = pageContextRuntime.chatScope;
