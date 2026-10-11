import { fail, isPlainObject } from "../security/validation.js";

const reasons = [
  "OBSERVING",
  "GOAL_OBSERVED",
  "GOAL_UNMET",
  "GOAL_UNCONFIRMED",
  "OBSERVATION_CHANGED",
  "OBSERVATION_UNAVAILABLE",
  "BINDING_CHANGED",
  "REASSESSMENT_LIMIT",
  "PROVIDER_FAILED",
  "VERIFIER_FAILED",
  "UNOBSERVED_ACTION",
  "REQUEST_ENDED",
] as const;
export type ActCompletion = {
  action_outcome: "VERIFIED" | "FAILED" | "UNKNOWN";
  goal_status: "checking" | "completed" | "incomplete" | "unknown";
  reason: (typeof reasons)[number];
  reassessments: number;
};
export const validActCompletion = (value: unknown): value is ActCompletion =>
  isPlainObject(value) &&
  Object.keys(value).length === 4 &&
  Object.keys(value).every((key) =>
    ["action_outcome", "goal_status", "reason", "reassessments"].includes(key),
  ) &&
  ["VERIFIED", "FAILED", "UNKNOWN"].includes(String(value.action_outcome)) &&
  ["checking", "completed", "incomplete", "unknown"].includes(
    String(value.goal_status),
  ) &&
  reasons.includes(value.reason as ActCompletion["reason"]) &&
  Number.isInteger(value.reassessments) &&
  Number(value.reassessments) >= 0 &&
  Number(value.reassessments) <= 2 &&
  (value.goal_status !== "completed" || value.action_outcome === "VERIFIED");
export const validateActCompletion = (value: unknown): ActCompletion => {
  if (!validActCompletion(value)) return fail("INVALID_ARGUMENT");
  return { ...value };
};
