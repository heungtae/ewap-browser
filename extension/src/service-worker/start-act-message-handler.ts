import type { BrowserSender } from "./browser-api.js";
import { exactKeys } from "./runtime-message-router.js";

type Respond = (response: unknown) => void;
type Tool =
  | "set_text_by_ref"
  | "select_option_by_ref"
  | "set_checked_by_ref"
  | "click_by_ref"
  | "press_key_by_ref";
export type StartActRequest = {
  tool: Tool;
  refId: string;
  checked?: boolean;
  key?: "Enter" | "Space" | "Escape";
  permissionRequestId?: string;
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  start(request: StartActRequest, respond: Respond): void;
  safeFailure(code: string): unknown;
};

export const createStartActMessageHandler = (dependencies: Dependencies) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    if ((message as { kind?: unknown }).kind !== "START_ACT")
      return { handled: false };
    const tool = (message as { tool?: unknown }).tool;
    const refId = (message as { ref_id?: unknown }).ref_id;
    const argument = (message as { argument?: unknown }).argument;
    const permissionRequestId = (message as { permission_request_id?: unknown })
      .permission_request_id;
    if (
      permissionRequestId !== undefined &&
      typeof permissionRequestId !== "string"
    ) {
      respond(dependencies.safeFailure("INVALID_ARGUMENT"));
      return { handled: true };
    }
    const hasKeys = (keys: readonly string[]): boolean =>
      exactKeys(
        message,
        permissionRequestId === undefined
          ? keys
          : [...keys, "permission_request_id"],
      );
    const checked =
      typeof argument === "object" && argument !== null
        ? (argument as { checked?: unknown }).checked
        : undefined;
    const key =
      typeof argument === "object" && argument !== null
        ? (argument as { key?: unknown }).key
        : undefined;
    const singleArgument = (name: "checked" | "key"): boolean =>
      typeof argument === "object" &&
      argument !== null &&
      Object.keys(argument).length === 1 &&
      name in argument;
    const valid =
      (tool === "set_text_by_ref" && hasKeys(["kind", "tool", "ref_id"])) ||
      (tool === "select_option_by_ref" &&
        hasKeys(["kind", "tool", "ref_id"])) ||
      (tool === "click_by_ref" && hasKeys(["kind", "tool", "ref_id"])) ||
      (tool === "set_checked_by_ref" &&
        hasKeys(["kind", "tool", "ref_id", "argument"]) &&
        singleArgument("checked") &&
        typeof checked === "boolean") ||
      (tool === "press_key_by_ref" &&
        hasKeys(["kind", "tool", "ref_id", "argument"]) &&
        singleArgument("key") &&
        (key === "Enter" || key === "Space" || key === "Escape"));
    if (
      !dependencies.isPanelSender(sender) ||
      !valid ||
      typeof refId !== "string"
    ) {
      respond(dependencies.safeFailure("PROFILE_UNAVAILABLE"));
      return { handled: true };
    }
    dependencies.start(
      {
        tool,
        refId,
        ...(typeof checked === "boolean" ? { checked } : {}),
        ...(key === "Enter" || key === "Space" || key === "Escape"
          ? { key }
          : {}),
        ...(typeof permissionRequestId === "string"
          ? { permissionRequestId }
          : {}),
      },
      respond,
    );
    return { handled: true, keepAlive: true };
  },
});
