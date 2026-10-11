import { fail, isPlainObject } from "../security/validation.js";

const reasons = [
  "OBSERVING",
  "GOAL_OBSERVED",
  "PROVIDER_COMPLETED",
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
  assessment?: {
    version: 1;
    calls: number;
    reads: number;
    confirmation: "local_verifier" | "llm_evidence" | "current_state" | "none";
  };
};
export const validActCompletion = (value: unknown): value is ActCompletion =>
  isPlainObject(value) &&
  (Object.keys(value).length === 4 ||
    (Object.keys(value).length === 5 && value.assessment !== undefined)) &&
  Object.keys(value).every((key) =>
    [
      "action_outcome",
      "goal_status",
      "reason",
      "reassessments",
      "assessment",
    ].includes(key),
  ) &&
  ["VERIFIED", "FAILED", "UNKNOWN"].includes(String(value.action_outcome)) &&
  ["checking", "completed", "incomplete", "unknown"].includes(
    String(value.goal_status),
  ) &&
  reasons.includes(value.reason as ActCompletion["reason"]) &&
  Number.isInteger(value.reassessments) &&
  Number(value.reassessments) >= 0 &&
  Number(value.reassessments) <= 2 &&
  (value.goal_status !== "completed" ||
    value.action_outcome === "VERIFIED" ||
    value.reason === "PROVIDER_COMPLETED") &&
  (value.reason !== "PROVIDER_COMPLETED" ||
    value.goal_status === "completed") &&
  (value.assessment === undefined ||
    (isPlainObject(value.assessment) &&
      Object.keys(value.assessment).length === 4 &&
      Object.keys(value.assessment).every((key) =>
        ["version", "calls", "reads", "confirmation"].includes(key),
      ) &&
      value.assessment.version === 1 &&
      Number.isInteger(value.assessment.calls) &&
      Number(value.assessment.calls) >= 0 &&
      Number(value.assessment.calls) <= 4 &&
      Number.isInteger(value.assessment.reads) &&
      Number(value.assessment.reads) >= 0 &&
      Number(value.assessment.reads) <= 2 &&
      ["local_verifier", "llm_evidence", "current_state", "none"].includes(
        String(value.assessment.confirmation),
      )));
export const validateActCompletion = (value: unknown): ActCompletion => {
  if (!validActCompletion(value)) return fail("INVALID_ARGUMENT");
  return { ...value };
};
