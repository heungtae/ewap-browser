import type { ErrorCode, Outcome } from "../contracts/types.js";
import { fail, isPlainObject } from "./validation.js";
export type AuditEvent = {
  event: "policy" | "terminal" | "mcp";
  outcome?: Outcome;
  code?: ErrorCode;
  tool?: string;
  profile_id?: string;
  profile_version?: number;
  server_id?: string;
  tool_id?: string;
  field_id?: string;
};
const allowed = new Set([
  "event",
  "outcome",
  "code",
  "tool",
  "profile_id",
  "profile_version",
  "server_id",
  "tool_id",
  "field_id",
]);
export const serializeAudit = (event: AuditEvent): string => {
  if (
    !isPlainObject(event) ||
    Object.keys(event).some((key) => !allowed.has(key))
  )
    fail("INVALID_ARGUMENT");
  return JSON.stringify(event);
};
