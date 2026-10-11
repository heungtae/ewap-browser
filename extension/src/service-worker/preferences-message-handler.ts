import {
  approvalSaveBoundary,
  approvalSettingsInvalid,
  markApprovalSettingsInvalid,
} from "./approval-runtime.js";
import { migrateApprovalPolicy } from "../policy/approval-policy.js";
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
  cancelAllRuns(): Promise<void>;
  safeFailure(code: string): unknown;
};

const failureCode = (error: unknown): string =>
  error instanceof ContractError ? error.code : "INVALID_ARGUMENT";

export const createPreferencesMessageHandler = (dependencies: Dependencies) => {
  let queue = Promise.resolve();
  let pendingSaves = 0;
  let storageFailed = false;
  return {
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
          ...(approvalSettingsInvalid()
            ? { approval_settings_error: "INVALID_APPROVAL_SETTINGS" }
            : {}),
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
        const expectedRevision = next.approval_policy?.revision;
        pendingSaves++;
        approvalSaveBoundary(true);
        queue = queue
          .catch(() => undefined)
          .then(async () => {
            const current = dependencies.preferences();
            const revision = current.approval_policy?.revision ?? 0;
            if (
              expectedRevision !== undefined &&
              expectedRevision !== revision
            ) {
              respond(dependencies.safeFailure("INVALID_ARGUMENT"));
              return;
            }
            await dependencies.cancelAllRuns();
            next.approval_policy = {
              ...(next.approval_policy ??
                migrateApprovalPolicy(next.permission_mode)),
              revision: revision + 1,
            };
            await dependencies.savePreferences(next);
            await dependencies.cancelAllRuns();
            storageFailed = false;
            markApprovalSettingsInvalid(false);
            respond({ ok: true, preferences: structuredClone(next) });
          })
          .catch(() => {
            storageFailed = true;
            markApprovalSettingsInvalid(true);
            respond(dependencies.safeFailure("STORAGE_BOUNDARY_UNAVAILABLE"));
          })
          .finally(() => {
            pendingSaves--;
            if (pendingSaves === 0 && !storageFailed)
              approvalSaveBoundary(false);
          });
      } catch (error) {
        respond(dependencies.safeFailure(failureCode(error)));
        return { handled: true };
      }
      return { handled: true, keepAlive: true };
    },
  };
};
