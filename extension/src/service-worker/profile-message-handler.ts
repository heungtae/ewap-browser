import { ContractError } from "../security/validation.js";
import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
type ResolvedProfile = {
  profile: {
    resolution: unknown;
    profile_id?: unknown;
    profile_version?: unknown;
    business_mcp?: unknown[] | undefined;
  };
};

type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  isPanelOrSettingsSender(sender: BrowserSender): boolean;
  resolveActiveProfile(): Promise<ResolvedProfile>;
  safeFailure(code: string): unknown;
};

export const createProfileMessageHandler = (dependencies: Dependencies) => {
  const respondProfile = (respond: Respond): void => {
    void dependencies
      .resolveActiveProfile()
      .then(({ profile }) =>
        respond({
          ok: true,
          resolution: profile.resolution,
          profile_id: profile.profile_id,
          profile_version: profile.profile_version,
          business_mcp_count: profile.business_mcp?.length ?? 0,
        }),
      )
      .catch((error) =>
        respond(
          dependencies.safeFailure(
            error instanceof ContractError ? error.code : "PROFILE_UNAVAILABLE",
          ),
        ),
      );
  };
  return {
    handle(
      message: object,
      sender: BrowserSender,
      respond: Respond,
    ): { handled: boolean; keepAlive?: boolean } {
      const kind = (message as { kind?: unknown }).kind;
      const allowed =
        kind === "START_ASK"
          ? dependencies.isPanelSender(sender)
          : kind === "RESOLVE_PROFILE"
            ? dependencies.isPanelOrSettingsSender(sender)
            : undefined;
      if (allowed === undefined) return { handled: false };
      if (!allowed || !exactKeys(message, ["kind"])) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      respondProfile(respond);
      return { handled: true, keepAlive: true };
    },
  };
};
