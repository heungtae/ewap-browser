import { ContractError } from "../security/validation.js";

export type RuntimeSender = { url?: string };
export type Respond = (response: unknown) => void;
export type RoutedMessage = { handled: boolean; keepAlive?: boolean };

export const exactKeys = (value: object, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key)) &&
  keys.every((key) => key in value);

export const failureCode = (error: unknown, fallback: string): string =>
  error instanceof ContractError ? error.code : fallback;

type RouterDependencies = {
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
  ["OFFSCREEN_FETCH", "OFFSCREEN_PROVIDER_REQUEST"].includes(
    (message as { kind?: unknown }).kind as string,
  );

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
    const chatRoute = dependencies.chatRoute.handle(message, sender, respond);
    if (chatRoute.handled) return chatRoute.keepAlive ? true : undefined;
    const domainRoute = dependencies.routeDomain(message, sender, respond);
    return domainRoute === true ? true : undefined;
  };
