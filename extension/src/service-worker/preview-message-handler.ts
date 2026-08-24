import { ContractError } from "../security/validation.js";
import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";
import type { SemanticSnapshot } from "../contracts/types.js";

type Respond = (response: unknown) => void;
type Active = {
  tabId: number;
  origin: string;
  snapshot: SemanticSnapshot;
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  active(): Promise<Active>;
  preview(active: Active): unknown;
  safeFailure(code: string): unknown;
};

export const createPreviewMessageHandler = (dependencies: Dependencies) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    if ((message as { kind?: unknown }).kind !== "START_PREVIEW")
      return { handled: false };
    if (!dependencies.isPanelSender(sender) || !exactKeys(message, ["kind"])) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void dependencies
      .active()
      .then((active) => {
        try {
          respond({ ok: true, snapshot: dependencies.preview(active) });
        } catch (error) {
          respond(
            dependencies.safeFailure(
              error instanceof ContractError
                ? error.code
                : "ORIGIN_NOT_ALLOWED",
            ),
          );
        }
      })
      .catch((error) =>
        respond(
          dependencies.safeFailure(
            error instanceof ContractError ? error.code : "ORIGIN_NOT_ALLOWED",
          ),
        ),
      );
    return { handled: true, keepAlive: true };
  },
});
