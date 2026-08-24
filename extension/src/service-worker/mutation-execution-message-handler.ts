import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
export type ActionValuePayload = {
  run_id: string;
  value_slot_id: string;
  value_kind: "text" | "option";
  value: string;
};
export type ConfirmationPayload = {
  run_id: string;
  confirmation_id: string;
  confirmation_nonce: string;
};
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  submitValue(payload: ActionValuePayload, respond: Respond): void;
  confirm(payload: ConfirmationPayload, respond: Respond): void;
  safeFailure(code: string): unknown;
};

export const createMutationExecutionMessageHandler = (
  dependencies: Dependencies,
) => ({
  handle(
    message: object,
    sender: BrowserSender,
    respond: Respond,
  ): { handled: boolean; keepAlive?: boolean } {
    const kind = (message as { kind?: unknown }).kind;
    if (kind === "CONFIRM") {
      if (
        !dependencies.isPanelSender(sender) ||
        !exactKeys(message, [
          "kind",
          "run_id",
          "confirmation_id",
          "confirmation_nonce",
        ]) ||
        typeof (message as { run_id?: unknown }).run_id !== "string" ||
        typeof (message as { confirmation_id?: unknown }).confirmation_id !==
          "string" ||
        typeof (message as { confirmation_nonce?: unknown })
          .confirmation_nonce !== "string"
      ) {
        respond(dependencies.safeFailure("CONFIRMATION_INVALID"));
        return { handled: true };
      }
      dependencies.confirm(message as ConfirmationPayload, respond);
      return { handled: true, keepAlive: true };
    }
    if (kind !== "SUBMIT_ACTION_VALUE") return { handled: false };
    if (
      !dependencies.isPanelSender(sender) ||
      !exactKeys(message, [
        "kind",
        "run_id",
        "value_slot_id",
        "value_kind",
        "value",
      ]) ||
      typeof (message as { run_id?: unknown }).run_id !== "string" ||
      typeof (message as { value_slot_id?: unknown }).value_slot_id !==
        "string" ||
      !["text", "option"].includes(
        (message as { value_kind?: unknown }).value_kind as string,
      ) ||
      typeof (message as { value?: unknown }).value !== "string"
    ) {
      respond(dependencies.safeFailure("VALUE_BINDING_INVALID"));
      return { handled: true };
    }
    dependencies.submitValue(message as ActionValuePayload, respond);
    return { handled: true, keepAlive: true };
  },
});
