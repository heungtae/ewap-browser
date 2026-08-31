import type { BrowserSender } from "./browser-api.js";
import type { RoutedMessage } from "./runtime-message-router.js";

export type DomainMessageHandler = {
  handle(
    message: object,
    sender: BrowserSender,
    respond: (response: unknown) => void,
  ): RoutedMessage;
};

type Dependencies = {
  handlers: readonly DomainMessageHandler[];
  safeFailure(code: string): unknown;
};

export const createDomainMessageRouter =
  (dependencies: Dependencies) =>
  (
    message: object,
    sender: BrowserSender,
    respond: (response: unknown) => void,
  ): boolean | void => {
    for (const handler of dependencies.handlers) {
      const route = handler.handle(message, sender, respond);
      if (route.handled) return route.keepAlive ? true : undefined;
    }
    respond(dependencies.safeFailure("INVALID_ARGUMENT"));
  };
