import type { ChatEventPayload } from "../contracts/chat-events.js";
import type { AgentPreferences } from "../policy/permission-mode.js";
import type { ResolvedProfile } from "../profile/resolver.js";
import type { ProviderRuntime } from "../providers/runtime.js";
import type {
  ProviderMessage,
  ProviderToolDefinition,
} from "../providers/types.js";
import type { PageScope } from "../state/tab-chat-session-store.js";
import type { VisionCapture } from "./vision-capture.js";
import type { BrowserChromeApi } from "./browser-api.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type { ActivePage } from "./page-context-runtime.js";

export type AskChatDependencies = {
  chrome: BrowserChromeApi;
  coordinator: ServiceCoordinator;
  provider: ProviderRuntime;
  preferences(): AgentPreferences;
  readActive(): Promise<ActivePage>;
  resolveProfile(active: ActivePage): Promise<ResolvedProfile>;
  threadContext(tabId: number): ProviderMessage[];
  pageScope(active: ActivePage): PageScope;
  bindRun(runId: string, tabId: number, scope: PageScope): void;
  publish(runId: string, event: ChatEventPayload): void;
  safeFailure(code: string, detail?: string): Record<string, unknown>;
  askTools: readonly ProviderToolDefinition[];
  systemPrompt: string;
  serialise(value: unknown): string;
  redactedTitle(value: string | undefined): string;
  providerFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response>;
  vision(runId: string, captureId: string): VisionCapture | undefined;
  rememberVision(runId: string, capture: VisionCapture): void;
  releaseVision(runId: string): void;
};
