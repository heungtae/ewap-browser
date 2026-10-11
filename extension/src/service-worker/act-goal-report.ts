import { fail, isPlainObject } from "../security/validation.js";
import type { ProviderChatResponse } from "../providers/types.js";
import type { ActSession } from "./act-session-types.js";

export const parseGoalReport = (
  response: ProviderChatResponse,
  session: ActSession,
  observationId: string,
  refs: string[],
  eligibleRefs: string[] = refs,
): {
  status: "completed" | "incomplete" | "unknown";
  summary: string;
  indexes: number[];
} => {
  const call = response.tool_calls[0];
  if (!call)
    return { status: "unknown", summary: response.content, indexes: [] };
  if (
    response.tool_calls.length !== 1 ||
    call.name !== "report_goal_status" ||
    !call.id ||
    session.messages.some(
      (m) => m.role === "tool" && m.tool_call_id === call.id,
    )
  )
    return fail("INVALID_ARGUMENT");
  let value: unknown;
  try {
    value = JSON.parse(call.arguments);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        !["status", "summary", "observation_id", "evidence_refs"].includes(key),
    ) ||
    !["completed", "incomplete", "unknown"].includes(String(value.status)) ||
    typeof value.summary !== "string" ||
    !value.summary.trim() ||
    value.summary.length > 4000 ||
    value.observation_id !== observationId ||
    (value.evidence_refs !== undefined &&
      (!Array.isArray(value.evidence_refs) ||
        value.evidence_refs.length > 8 ||
        value.evidence_refs.some(
          (ref) => typeof ref !== "string" || !eligibleRefs.includes(ref),
        )))
  )
    return fail("INVALID_ARGUMENT");
  return {
    status: value.status as "completed" | "incomplete" | "unknown",
    summary: value.summary,
    indexes: ((value.evidence_refs ?? []) as string[]).map((ref) =>
      refs.indexOf(ref),
    ),
  };
};
