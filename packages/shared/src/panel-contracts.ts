import { z } from "zod";
export const panelId = z.string().min(1).max(128);
export const panelPromptSchema = z.strictObject({
  id: panelId,
  requestId: panelId,
  documentId: panelId,
  revision: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
});
// Display metadata only; the backend resolves and revalidates execution identity.
export const panelActionSchema = z.strictObject({
  tool: z.string().min(1).max(128),
  target_name: z.string().max(200),
  approval_scope: z.enum(["single_step", "session"]).optional(),
  approval_reason: z.string().max(2000).optional(),
  origin: z.string().url().max(2048).optional(),
  suggested_value: z.string().max(4096).optional(),
  suggested_value_length: z.number().int().nonnegative().optional(),
  suggested_value_truncated: z.boolean().optional(),
  suggested_value_tail: z.string().max(256).optional(),
  suggested_value_digest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  workflow_title: z.string().max(200).optional(),
  workflow_step: z.number().int().positive().optional(),
  workflow_total: z.number().int().positive().optional(),
});
export const panelCandidateSchema = z.strictObject({
  id: panelId,
  source: z.enum(["profile", "recorded", "runtime"]),
  title: z.string().max(200),
  origin: z.string().url().max(2048),
  path_prefix: z.string().max(2048),
  step_count: z.number().int().min(1).max(128),
  status: z.enum(["verified", "draft", "stale", "incomparable"]),
  detail: z.string().max(2000),
  runtime_kind: z.enum(["code-analysis", "page-declared"]).optional(),
});
export const panelCompletionSchema = z
  .strictObject({
    action_outcome: z.enum(["VERIFIED", "FAILED", "UNKNOWN"]),
    goal_status: z.enum(["checking", "completed", "incomplete", "unknown"]),
    reason: z.enum([
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
    ]),
    reassessments: z.number().int().min(0).max(2),
    assessment: z
      .strictObject({
        version: z.literal(1),
        calls: z.number().int().min(0).max(4),
        reads: z.number().int().min(0).max(2),
        confirmation: z.enum([
          "local_verifier",
          "llm_evidence",
          "current_state",
          "none",
        ]),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (
      (value.goal_status === "completed" &&
        value.action_outcome !== "VERIFIED" &&
        value.reason !== "PROVIDER_COMPLETED") ||
      (value.reason === "PROVIDER_COMPLETED" &&
        value.goal_status !== "completed")
    )
      context.addIssue({
        code: "custom",
        message: "Completion facts conflict",
      });
  });
export type PanelAction = z.infer<typeof panelActionSchema>;
export type PanelPrompt = z.infer<typeof panelPromptSchema>;
export type PanelCandidate = z.infer<typeof panelCandidateSchema>;
