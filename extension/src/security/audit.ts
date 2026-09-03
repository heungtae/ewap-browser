import type { ErrorCode, Outcome, Risk } from "../contracts/types.js";
import { fail, isPlainObject } from "./validation.js";
export type AuditEvent = {
  event: "policy" | "terminal" | "mcp" | "workflow";
  outcome?: Outcome;
  code?: ErrorCode;
  tool?: string;
  profile_id?: string;
  profile_version?: number;
  server_id?: string;
  tool_id?: string;
  field_id?: string;
  run_id?: string;
  workflow_id?: string;
  origin?: string;
  policy_version?: string;
  decision?: "ALLOW" | "DENY";
  capability?:
    | "navigate"
    | "click"
    | "type"
    | "network_write"
    | "download"
    | "upload"
    | "schedule";
  risk?: Risk;
  stage?: "requested" | "authorized" | "executed" | "verified";
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
  "run_id",
  "workflow_id",
  "origin",
  "policy_version",
  "decision",
  "capability",
  "risk",
  "stage",
]);
const safeText = (value: unknown, maximum = 160): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maximum;
const safeOrigin = (value: unknown): boolean => {
  if (!safeText(value, 512)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.origin === value;
  } catch {
    return false;
  }
};
export const serializeAudit = (event: AuditEvent): string => {
  if (
    !isPlainObject(event) ||
    Object.keys(event).some((key) => !allowed.has(key)) ||
    !["policy", "terminal", "mcp", "workflow"].includes(event.event) ||
    (event.origin !== undefined && !safeOrigin(event.origin)) ||
    [
      event.tool,
      event.profile_id,
      event.server_id,
      event.tool_id,
      event.field_id,
      event.run_id,
      event.workflow_id,
      event.policy_version,
    ].some((value) => value !== undefined && !safeText(value)) ||
    (event.profile_version !== undefined &&
      (!Number.isInteger(event.profile_version) ||
        event.profile_version < 1)) ||
    (event.decision !== undefined &&
      !["ALLOW", "DENY"].includes(event.decision)) ||
    (event.capability !== undefined &&
      ![
        "navigate",
        "click",
        "type",
        "network_write",
        "download",
        "upload",
        "schedule",
      ].includes(event.capability)) ||
    (event.risk !== undefined &&
      !["R0", "R1", "R2", "R3"].includes(event.risk)) ||
    (event.stage !== undefined &&
      !["requested", "authorized", "executed", "verified"].includes(
        event.stage,
      ))
  )
    fail("INVALID_ARGUMENT");
  return JSON.stringify(event);
};
