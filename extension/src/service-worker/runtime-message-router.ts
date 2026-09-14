import { ContractError } from "../security/validation.js";
import type { BrowserSender } from "./browser-api.js";

export type RuntimeSender = BrowserSender;
export type Respond = (response: unknown) => void;
export type RoutedMessage = { handled: boolean; keepAlive?: boolean };

export const exactKeys = (value: object, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => key in value);

export const failureCode = (error: unknown, fallback: string): string =>
  error instanceof ContractError ? error.code : fallback;

type RouterDependencies = {
  isPanelSender?(sender: RuntimeSender): boolean;
  storageReady(): boolean;
  safeFailure(code: string, detail?: string): unknown;
  chatRoute: {
    handle(
      message: object,
      sender: RuntimeSender,
      respond: Respond,
    ): RoutedMessage;
  };
  routeDomain(
    message: object,
    sender: RuntimeSender,
    respond: Respond,
  ): boolean | void;
};

const isOffscreenMessage = (message: unknown): boolean =>
  typeof message === "object" &&
  message !== null &&
  [
    "OFFSCREEN_FETCH",
    "OFFSCREEN_PROVIDER_REQUEST",
    "OFFSCREEN_PROVIDER_READY_CHECK",
  ].includes((message as { kind?: unknown }).kind as string);

/**
 * Owns only the common runtime-message envelope flow. Domain handlers stay
 * independent and are called after storage readiness, object shape, and chat
 * routing have been checked.
 */
export const createRuntimeMessageRouter =
  (
    dependencies: RouterDependencies,
  ): ((
    message: unknown,
    sender: RuntimeSender,
    respond: Respond,
  ) => boolean | void) =>
  (message, sender, respond) => {
    if (isOffscreenMessage(message)) return;
    if (!dependencies.storageReady()) {
      respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE"));
      return;
    }
    if (typeof message !== "object" || message === null) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return;
    }
    if ((message as { kind?: unknown }).kind === "PANEL_REQUEST") {
      const envelope = message as { window_id?: unknown; payload?: unknown };
      if (
        !dependencies.isPanelSender?.(sender) ||
        !exactKeys(message, ["kind", "window_id", "payload"]) ||
        !Number.isInteger(envelope.window_id) ||
        (envelope.window_id as number) < 0 ||
        typeof envelope.payload !== "object" ||
        envelope.payload === null
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return;
      }
      sender = { ...sender, panelWindowId: envelope.window_id as number };
      message = envelope.payload;
    }
    const chatRoute = dependencies.chatRoute.handle(
      message as object,
      sender,
      respond,
    );
    if (chatRoute.handled) return chatRoute.keepAlive ? true : undefined;
    const domainRoute = dependencies.routeDomain(
      message as object,
      sender,
      respond,
    );
    return domainRoute === true ? true : undefined;
  };
