import type { ChatEventPayload } from "../contracts/chat-events.js";
import type { AgentPreferences } from "../policy/permission-mode.js";
import type { ProviderRuntime } from "../providers/runtime.js";
import type { ProviderMessage } from "../providers/types.js";
import type { PageScope } from "../state/tab-chat-session-store.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { ActSession } from "./act-session-types.js";

export type ActStepDependencies = {
  coordinator: ServiceCoordinator;
  provider: ProviderRuntime;
  preferences(): AgentPreferences;
  readActive(): Promise<ActivePage>;
  threadContext(tabId: number): ProviderMessage[];
  pageScope(active: ActivePage): PageScope;
  bindRun(runId: string, tabId: number, scope: PageScope): void;
  publish(runId: string, event: ChatEventPayload): void;
  serialise(value: unknown): string;
  executeApprovedProposal(
    session: ActSession,
  ): Promise<Record<string, unknown>>;
  endSession(session: ActSession): void;
};
