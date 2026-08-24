import { ContractError, isPlainObject } from "../security/validation.js";
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

type Sender = RuntimeSender;
type ChatResult = { ok?: boolean };
type ActiveTab = { id: number; title?: string; url?: string };

export type ChatMessageHandlerDependencies = {
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
  isPanelSender(sender: Sender): boolean;
  providerAvailable(): boolean;
  runActChat(payload: unknown): Promise<ChatResult>;
  runAskChat(payload: unknown): Promise<ChatResult>;
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
} => ({
  handle(message, sender, respond) {
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "CHAT_SEND") {
      console.debug("[ContextPilot][CHAT_SEND received]", {
        payload: structuredClone((message as { payload?: unknown }).payload),
        sender_url: sender.url,
      });
      if (
        !dependencies.isPanelSender(sender) ||
        !dependencies.providerAvailable()
      ) {
        console.error("[ContextPilot][CHAT_SEND rejected]", {
          is_panel_sender: dependencies.isPanelSender(sender),
          provider_runtime_ready: dependencies.providerAvailable(),
        });
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      const payload = (message as { payload?: unknown }).payload;
      const mode = isPlainObject(payload) ? payload.mode : undefined;
      void (
        mode === "act"
          ? dependencies.runActChat(payload)
          : dependencies.runAskChat(payload)
      )
        .then((result) => respond(result))
        .catch((error) => {
          const code = failureCode(error, "PROVIDER_PLUGIN_FAILED");
          console.error("[ContextPilot][CHAT_SEND failed before/at LLM]", {
            code,
            ...(error instanceof ContractError && error.detail
              ? { detail: error.detail }
              : {}),
          });
          respond(
            dependencies.safeFailure(
              code,
              error instanceof ContractError ? error.detail : undefined,
            ),
          );
        });
      return { handled: true, keepAlive: true };
    }
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
});
