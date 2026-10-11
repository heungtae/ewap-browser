import type {
  Capability,
  PermissionManager,
} from "../policy/permission-manager.js";
import type { AgentPreferences } from "../policy/permission-mode.js";
import type { SemanticNode } from "../contracts/types.js";
import type {
  LocalFixtureSessionBinding,
  SessionBinding,
} from "../state/local-session-binding.js";
import type { ServiceCoordinator } from "./coordinator.js";
type PermissionRequest = {
  capability: Capability;
  origin: string;
  expiresAt: number;
  act_session_id?: string;
};
type Active = {
  tabId: number;
  origin: string;
  snapshot: {
    document_epoch: string;
    nodes: SemanticNode[];
  };
};
export type Dependencies = {
  readActive(): Promise<Active>;
  preferences(): AgentPreferences;
  permissions: PermissionManager;
  requests: Map<string, PermissionRequest>;
  createId(): string;
  coordinator: ServiceCoordinator;
  bindings: Map<string, SessionBinding>;
  localSessions: LocalFixtureSessionBinding;
  profile: { id: string; version: number };
  execute(
    run: Parameters<ServiceCoordinator["mutations"]["executeR1"]>[0],
    ready: ReturnType<ServiceCoordinator["mutations"]["executeR1"]>,
    respond: (response: unknown) => void,
    origin: string,
  ): void;
  safeFailure(code: string): unknown;
};
