import type { Outcome } from "./core-types.js";
import type { ChatActionView, ChatMode } from "./chat-event-types.js";
import { fail, isPlainObject, opaque, string } from "../security/validation.js";

export const outcomes = new Set<Outcome>([
  "VERIFIED",
  "FAILED",
  "UNKNOWN",
  "CANCELLED",
]);
export const modes = new Set<ChatMode>(["ask", "act"]);
export const allowedEventKeys = [
  "type",
  "session_id",
  "thread_id",
  "tab_id",
  "run_id",
  "sequence",
  "mode",
  "permission_mode",
  "text",
  "tool_use_id",
  "tool",
  "summary",
  "result",
  "action",
  "request_id",
  "capability",
  "host",
  "value_kind",
  "confirmation_id",
  "confirmation_nonce",
  "outcome",
  "code",
] as const;
export const validateActionView = (value: unknown): ChatActionView => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "session_id",
          "proposal_id",
          "tool",
          "target_name",
          "origin",
        ].includes(key),
    ) ||
    typeof value.session_id !== "string" ||
    typeof value.proposal_id !== "string" ||
    typeof value.tool !== "string" ||
    typeof value.target_name !== "string" ||
    (value.origin !== undefined && typeof value.origin !== "string")
  )
    return fail("INVALID_ARGUMENT");
  return {
    session_id: opaque(value.session_id),
    proposal_id: opaque(value.proposal_id),
    tool: string(value.tool, 128),
    target_name: string(value.target_name, 512),
    ...(typeof value.origin === "string"
      ? { origin: string(value.origin, 512) }
      : {}),
  };
};
