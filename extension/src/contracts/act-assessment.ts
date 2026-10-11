import { isPlainObject, fail } from "../security/validation.js";

export type DispatchReceipt = "not_dispatched" | "dispatched" | "unknown";
export type ActAssessment = {
  phase: "action";
  observation_id: string;
  attempt_id: string;
  decision: "confirmed" | "not_completed" | "need_more_data" | "unknown";
  facts: string;
  rationale: string;
  evidence_ids: string[];
};
export const parseActAssessment = (
  args: string,
  observationId: string,
  attemptId: string,
  evidenceIds: string[],
): ActAssessment => {
  let value: unknown;
  try {
    value = JSON.parse(args);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  const keys = [
    "phase",
    "observation_id",
    "attempt_id",
    "decision",
    "facts",
    "rationale",
    "evidence_ids",
  ];
  if (
    !isPlainObject(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key)) ||
    value.phase !== "action" ||
    value.observation_id !== observationId ||
    value.attempt_id !== attemptId ||
    !["confirmed", "not_completed", "need_more_data", "unknown"].includes(
      String(value.decision),
    ) ||
    typeof value.facts !== "string" ||
    !value.facts.trim() ||
    value.facts.length > 2000 ||
    typeof value.rationale !== "string" ||
    !value.rationale.trim() ||
    value.rationale.length > 2000 ||
    !Array.isArray(value.evidence_ids) ||
    value.evidence_ids.length > 8 ||
    new Set(value.evidence_ids).size !== value.evidence_ids.length ||
    value.evidence_ids.some(
      (id) => typeof id !== "string" || !evidenceIds.includes(id),
    ) ||
    (value.decision === "confirmed" && !value.evidence_ids.length)
  )
    return fail("INVALID_ARGUMENT");
  return value as ActAssessment;
};
