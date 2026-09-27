import type { ErrorCode, Outcome, Risk } from "../contracts/types.js";
import { isErrorCode } from "../contracts/error-codes.js";
import { fail, isPlainObject } from "./validation.js";
export type AuditEvent = {
  event: "policy" | "terminal";
  outcome?: Outcome;
  code?: ErrorCode;
  profile_id?: string;
  profile_version?: number;
  run_id: string;
  workflow_id?: string;
  origin?: string;
  decision?: "ALLOW" | "DENY";
  capability?:
    | "navigate"
    | "page_api"
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
  "profile_id",
  "profile_version",
  "run_id",
  "workflow_id",
  "origin",
  "decision",
  "capability",
  "risk",
  "stage",
]);
const safeId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 160 &&
  /^[A-Za-z0-9._:-]+$/.test(value);
const safeOrigin = (value: unknown): boolean => {
  if (typeof value !== "string" || value.length > 512) return false;
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
    (event.event !== "policy" && event.event !== "terminal") ||
    !safeId(event.run_id) ||
    (event.event === "policy" &&
      event.decision === undefined &&
      event.code === undefined) ||
    (event.event === "terminal" && event.outcome === undefined) ||
    (event.event === "policy" && event.outcome !== undefined) ||
    (event.event === "terminal" && event.decision !== undefined) ||
    (event.origin !== undefined && !safeOrigin(event.origin)) ||
    [event.profile_id, event.workflow_id].some(
      (value) => value !== undefined && !safeId(value),
    ) ||
    (event.profile_version !== undefined &&
      (!Number.isInteger(event.profile_version) ||
        event.profile_version < 1)) ||
    (event.code !== undefined && !isErrorCode(event.code)) ||
    (event.outcome !== undefined &&
      !["VERIFIED", "FAILED", "UNKNOWN", "CANCELLED"].includes(
        event.outcome,
      )) ||
    (event.decision !== undefined &&
      !["ALLOW", "DENY"].includes(event.decision)) ||
    (event.capability !== undefined &&
      ![
        "navigate",
        "page_api",
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
