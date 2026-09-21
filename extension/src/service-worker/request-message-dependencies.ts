import type { Mode } from "../contracts/core-types.js";
import { isPlainObject } from "../security/validation.js";
import { ChatRequestLifecycle } from "./chat-request-lifecycle.js";
import type { RequestContext } from "./request-context.js";
import type { ExecutionDiagnostics } from "./execution-diagnostics.js";
import { TabChatSessionStore } from "../state/tab-chat-session-store.js";
import { exactKeys, type RuntimeSender } from "./runtime-message-router.js";

type Payload = { mode: Mode; prompt: string };
type Result = { ok?: boolean; state?: string };
export type Dependencies = {
  activeTab(sender: RuntimeSender): Promise<{ id: number; epoch?: string }>;
  cancel(tabId: number): void;
  isPanelSender(sender: RuntimeSender): boolean;
  providerAvailable(): boolean;
  requests: ChatRequestLifecycle;
  diagnostics?: ExecutionDiagnostics;
  chatEvents: TabChatSessionStore;
  providerDiagnostics?(): Promise<unknown>;
  sendToContentScript(tabId: number, message: unknown): Promise<unknown>;
  runAct(payload: unknown, context?: RequestContext): Promise<Result>;
  runAsk(payload: unknown, context?: RequestContext): Promise<Result>;
  safeFailure(code: string): unknown;
};

export const requestId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

export const payload = (value: unknown): Payload | undefined => {
  if (!isPlainObject(value) || !exactKeys(value, ["mode", "prompt"])) return;
  if (
    (value.mode !== "ask" && value.mode !== "act") ||
    typeof value.prompt !== "string" ||
    value.prompt.length === 0 ||
    value.prompt.length > 8_000
  )
    return;
  return { mode: value.mode, prompt: value.prompt };
};
