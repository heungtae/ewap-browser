import { isErrorCode } from "./error-codes.js";
import { fail } from "../security/validation.js";
import type { ChatEventPayload } from "./chat-event-types.js";
type Activity = Omit<
  Extract<ChatEventPayload, { type: "provider_activity" }>,
  "type"
>;
export const validateProviderActivity = (
  value: Record<string, unknown>,
): Activity => {
  if (
    !["primary", "decision"].includes(String(value.provider_role)) ||
    ![
      "DECIDING",
      "DELEGATING",
      "PROCESSING",
      "REVIEWING",
      "FALLBACK",
      "STOPPED",
    ].includes(String(value.stage)) ||
    ![
      "intent",
      "workflow_suitability",
      "candidate_selection",
      "element_assessment",
      "action_assessment",
      "goal_assessment",
      "result_acceptance",
      "primary_processing",
    ].includes(String(value.phase)) ||
    (value.code !== undefined && !isErrorCode(value.code))
  )
    return fail("INVALID_ARGUMENT");
  return {
    provider_role: value.provider_role as Activity["provider_role"],
    stage: value.stage as Activity["stage"],
    phase: value.phase as Activity["phase"],
    ...(typeof value.code === "string" ? { code: value.code } : {}),
  };
};
