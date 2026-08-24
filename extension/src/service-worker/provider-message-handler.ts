import { ContractError } from "../security/validation.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
const providerMessageKinds = new Set([
  "PROVIDER_LIST",
  "PLUGIN_INSTALL",
  "PLUGIN_SET_ENABLED",
  "PROVIDER_SAVE",
  "PROVIDER_TEST",
  "PROVIDER_MODELS",
  "PROVIDER_EXPORT",
]);

type Dependencies = {
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  providerAvailable(): boolean;
  handleProvider(kind: string, payload: unknown): Promise<unknown>;
  safeFailure(code: string, detail?: string): unknown;
};

export const createProviderMessageHandler = (dependencies: Dependencies) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    const kind = (message as { kind?: unknown }).kind;
    if (typeof kind !== "string" || !providerMessageKinds.has(kind))
      return { handled: false };
    if (
      !dependencies.isPanelOrSettingsSender(sender) ||
      !dependencies.providerAvailable()
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    void dependencies
      .handleProvider(kind, (message as { payload?: unknown }).payload)
      .then(respond)
      .catch((error) =>
        respond(
          dependencies.safeFailure(
            error instanceof ContractError
              ? error.code
              : "PROVIDER_PLUGIN_FAILED",
            error instanceof ContractError ? error.detail : undefined,
          ),
        ),
      );
    return { handled: true, keepAlive: true };
  },
});
