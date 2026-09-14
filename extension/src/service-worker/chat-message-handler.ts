import {
  canonicalPageScope,
  redactForChat,
} from "../security/chat-redaction.js";
import {
  exactKeys,
  failureCode,
  type Respond,
  type RoutedMessage,
  type RuntimeSender,
} from "./runtime-message-router.js";
import { createChatRequestMessageHandler } from "./chat-request-message-handler.js";
import { ChatRequestLifecycle } from "./chat-request-lifecycle.js";
import type { ExecutionDiagnostics } from "./execution-diagnostics.js";
import type { RequestContext } from "./request-context.js";

type Sender = RuntimeSender;
type ChatResult = { ok?: boolean };
type ActiveTab = { id: number; title?: string; url?: string };

export type ChatMessageHandlerDependencies = {
  activeTabForBoundPanel(
    sender: Sender,
  ): Promise<{ id: number; epoch?: string }>;
  activeTabForPanel(sender: Sender): Promise<ActiveTab>;
  cancelActiveTab(tabId: number): void;
  chatEvents: {
    clear(): void;
    recoverable(tabId: number): unknown;
    scope(tabId: number): unknown;
    sinceThreadForRun(runId: string, sequence: number): unknown;
  };
  chatPersistence: { clear(): Promise<void> };
  clearScheduledChatPersistence(): void;
  diagnostics?: ExecutionDiagnostics;
  isPanelSender(sender: Sender): boolean;
  providerAvailable(): boolean;
  requests: ChatRequestLifecycle;
  runActChat(payload: unknown, context?: RequestContext): Promise<ChatResult>;
  runAskChat(payload: unknown, context?: RequestContext): Promise<ChatResult>;
  safeFailure(code: string, detail?: string): unknown;
};

/**
 * This label is display-only. Do not return a query, fragment, DOM text, or
 * any other page content through the recovery path.
 */
const pageLabel = (
  tab: ActiveTab,
): { title: string; origin?: string } | undefined => {
  const title = redactForChat(tab.title ?? "", 160)
    .replace(/\s+/g, " ")
    .trim();
  const origin = canonicalPageScope(tab.url)?.origin;
  if (!title && !origin) return;
  return { title: title || origin!, ...(origin ? { origin } : {}) };
};

export const createChatMessageHandler = (
  dependencies: ChatMessageHandlerDependencies,
): {
  handle(message: object, sender: Sender, respond: Respond): RoutedMessage;
} => {
  const requestHandler = createChatRequestMessageHandler({
    activeTab: dependencies.activeTabForBoundPanel,
    cancel: dependencies.cancelActiveTab,
    isPanelSender: dependencies.isPanelSender,
    providerAvailable: dependencies.providerAvailable,
    requests: dependencies.requests,
    ...(dependencies.diagnostics
      ? { diagnostics: dependencies.diagnostics }
      : {}),
    runAct: dependencies.runActChat,
    runAsk: dependencies.runAskChat,
    safeFailure: dependencies.safeFailure,
  });
  return {
    handle(message, sender, respond) {
      const kind = (message as { kind?: unknown }).kind;
      const requestRoute = requestHandler.handle(message, sender, respond);
      if (requestRoute.handled) return requestRoute;
      if (kind === "CHAT_RESYNC") {
        const runId = (message as { run_id?: unknown }).run_id;
        const sequence = (message as { sequence?: unknown }).sequence;
        if (
          !dependencies.isPanelSender(sender) ||
          !exactKeys(message, ["kind", "run_id", "sequence"]) ||
          typeof runId !== "string" ||
          !Number.isInteger(sequence) ||
          (sequence as number) < 0
        ) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        try {
          respond({
            ok: true,
            events: dependencies.chatEvents.sinceThreadForRun(
              runId,
              sequence as number,
            ),
          });
        } catch (error) {
          respond(
            dependencies.safeFailure(failureCode(error, "INVALID_ARGUMENT")),
          );
        }
        return { handled: true };
      }
      if (kind === "CHAT_RECOVER") {
        if (
          !dependencies.isPanelSender(sender) ||
          !exactKeys(message, ["kind"])
        ) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        void dependencies
          .activeTabForPanel(sender)
          .then((active) => {
            const page = pageLabel(active);
            respond({
              ok: true,
              tab_id: active.id,
              events: dependencies.chatEvents.recoverable(active.id),
              scope: dependencies.chatEvents.scope(active.id),
              ...(page ? { page } : {}),
            });
          })
          .catch((error) =>
            respond(
              dependencies.safeFailure(
                failureCode(error, "STORAGE_BOUNDARY_UNAVAILABLE"),
              ),
            ),
          );
        return { handled: true, keepAlive: true };
      }
      if (kind === "CHAT_CLEAR") {
        if (
          !dependencies.isPanelSender(sender) ||
          !exactKeys(message, ["kind"])
        ) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        void dependencies
          .activeTabForPanel(sender)
          .then(async (active) => {
            dependencies.cancelActiveTab(active.id);
            dependencies.clearScheduledChatPersistence();
            dependencies.chatEvents.clear();
            await dependencies.chatPersistence.clear();
            respond({ ok: true });
          })
          .catch((error) =>
            respond(
              dependencies.safeFailure(
                failureCode(error, "STORAGE_BOUNDARY_UNAVAILABLE"),
              ),
            ),
          );
        return { handled: true, keepAlive: true };
      }
      return { handled: false };
    },
  };
};
