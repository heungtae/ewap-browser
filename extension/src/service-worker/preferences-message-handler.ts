import { ContractError, isPlainObject } from "../security/validation.js";
import type { AgentPreferences } from "../policy/permission-mode.js";
import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
type Dependencies = {
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  isSettingsSender(sender: BrowserSender): boolean;
  preferences(): AgentPreferences;
  validatePreferences(value: unknown): AgentPreferences;
  savePreferences(preferences: AgentPreferences): Promise<void>;
  cancelActiveRun(): Promise<void>;
  safeFailure(code: string): unknown;
};

const failureCode = (error: unknown): string =>
  error instanceof ContractError ? error.code : "INVALID_ARGUMENT";

export const createPreferencesMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "AGENT_PREFERENCES_GET") {
      if (
        !dependencies.isPanelOrSettingsSender(sender) ||
        !exactKeys(message, ["kind"])
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      respond({
        ok: true,
        preferences: structuredClone(dependencies.preferences()),
      });
      return { handled: true };
    }
    if (kind !== "AGENT_PREFERENCES_SAVE") return { handled: false };
    const payload = (message as { payload?: unknown }).payload;
    if (
      !dependencies.isSettingsSender(sender) ||
      !exactKeys(message, ["kind", "payload"]) ||
      !isPlainObject(payload) ||
      Object.keys(payload).some(
        (key) => !["preferences", "acknowledgement"].includes(key),
      )
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    try {
      const next = dependencies.validatePreferences(payload.preferences);
      if (
        next.permission_mode === "skip_all_permission_checks" &&
        dependencies.preferences().permission_mode !==
          "skip_all_permission_checks" &&
        payload.acknowledgement !== "권한 질문 생략"
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      void dependencies
        .savePreferences(next)
        .then(async () => {
          await dependencies.cancelActiveRun();
          respond({ ok: true, preferences: structuredClone(next) });
        })
        .catch(() =>
          respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE")),
        );
    } catch (error) {
      respond(dependencies.safeFailure(failureCode(error)));
      return { handled: true };
    }
    return { handled: true, keepAlive: true };
  },
});
