import { z } from "zod";
import { validActCompletion } from "../../../../extension/src/contracts/act-completion.js";
import { isErrorCode } from "../../../../extension/src/contracts/error-codes.js";
import { activityStages } from "../../../../extension/src/contracts/chat-event-validation.js";
import type { RequestStage } from "../../../../extension/src/contracts/request-types.js";
const stages = new Set<string>([
  ...activityStages,
  "ACCEPTED",
  "TERMINAL",
  "PROVIDER_BODY",
  "DISPATCH",
  "VERIFY",
]);
// The migration decoder intentionally has no restore TTL or last-100 truncation:
// old terminal records must be archived/quarantined rather than silently dropped.
export const legacyRequestSchema = z.strictObject({
  request_id: z.string().regex(/^[0-9a-f-]{36}$/i),
  revision: z.number().int().nonnegative().safe(),
  state: z.enum(["ACCEPTED", "RUNNING", "WAITING_USER", "TERMINAL"]),
  stage: z.custom<RequestStage>(
    (value) => typeof value === "string" && stages.has(value),
  ),
  tab_id: z.number().int().nonnegative().safe(),
  started_at_ms: z.number().nonnegative().finite(),
  stage_started_at_ms: z.number().nonnegative().finite(),
  last_progress_at_ms: z.number().nonnegative().finite(),
  owner: z.string().max(256),
  outcome: z.enum(["VERIFIED", "FAILED", "UNKNOWN", "CANCELLED"]).optional(),
  code: z
    .custom<
      import("../../../../extension/src/contracts/core-types.js").ErrorCode
    >(isErrorCode)
    .optional(),
  dispatch_started: z.literal(true).optional(),
  completion: z
    .custom<
      import("../../../../extension/src/contracts/act-completion.js").ActCompletion
    >(validActCompletion)
    .optional(),
});
export type LegacyRequest = z.infer<typeof legacyRequestSchema>;
export function dispatchPossible(row: LegacyRequest) {
  return (
    row.outcome === "UNKNOWN" ||
    row.dispatch_started === true ||
    row.completion?.action_outcome === "VERIFIED" ||
    row.completion?.action_outcome === "UNKNOWN" ||
    [
      "DISPATCH",
      "VERIFY",
      "VERIFYING_RESULT",
      "PAGE_API_DISPATCH",
      "PAGE_API_RETURNED",
    ].includes(row.stage)
  );
}
export function dispatchUnknown(row: LegacyRequest) {
  return (
    row.outcome === "UNKNOWN" ||
    (dispatchPossible(row) &&
      (row.state !== "TERMINAL" || row.outcome !== "VERIFIED"))
  );
}
