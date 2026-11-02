import { z } from "zod";
import {
  panelId,
  panelPromptSchema,
  panelActionSchema,
  panelCandidateSchema,
  panelCompletionSchema,
} from "./panel-contracts.js";
export * from "./panel-contracts.js";
const base = { runId: panelId, requestId: panelId };
const decision = { runId: panelId, prompt: panelPromptSchema };
const promptEvent = { ...base, prompt: panelPromptSchema };
export const panelEventSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal("run_started"),
    mode: z.enum(["ask", "act"]),
    permission_mode: z.enum([
      "standard",
      "full",
      "custom",
      "skip_all_permission_checks",
      "follow_a_plan",
    ]),
  }),
  z.strictObject({
    ...base,
    type: z.literal("message"),
    role: z.enum(["user", "assistant"]),
    text: z.string().max(16000),
  }),
  z.strictObject({
    ...base,
    type: z.literal("assistant_delta"),
    text: z.string().max(16000),
  }),
  z.strictObject({
    ...base,
    type: z.literal("activity"),
    text: z.string().max(1000),
    finished: z.boolean(),
  }),
  z.strictObject({
    ...base,
    type: z.literal("tool"),
    id: panelId,
    label: z.string().max(200),
    summary: z.string().max(2000),
    outcome: z.enum(["VERIFIED", "FAILED", "UNKNOWN"]).optional(),
  }),
  z.strictObject({
    ...promptEvent,
    type: z.literal("action_review_required"),
    action: panelActionSchema,
  }),
  z.strictObject({
    ...promptEvent,
    type: z.literal("permission_required"),
    action: panelActionSchema,
    capability: z.enum(["type", "navigate", "page_method", "click"]),
    host: z.string().max(256),
  }),
  z.strictObject({
    ...promptEvent,
    type: z.literal("value_required"),
    action: panelActionSchema,
    value_kind: z.enum(["text", "option"]),
  }),
  z.strictObject({
    ...promptEvent,
    type: z.literal("confirmation_required"),
    action: panelActionSchema,
    confirmation_id: panelId,
    confirmation_nonce: panelId,
  }),
  z.strictObject({
    ...promptEvent,
    type: z.literal("source_consent_required"),
    purpose: z.enum([
      "source",
      "component-scroll",
      "component-vision",
      "runtime-methods",
      "jev-decision",
      "runtime-result",
    ]),
    host: z.string().max(256),
    resource_count: z.number().int().nonnegative(),
  }),
  z.strictObject({
    ...promptEvent,
    type: z.literal("workflow_candidates"),
    candidates: z.array(panelCandidateSchema).max(32),
    appendOnly: z.boolean(),
  }),
  z.strictObject({
    ...promptEvent,
    type: z.literal("workflow_preview"),
    candidate: panelCandidateSchema,
  }),
  z.strictObject({
    ...promptEvent,
    type: z.literal("workflow_code_consent"),
    script_count: z.number().int().nonnegative(),
    inline_chars: z.number().int().nonnegative(),
    origins: z.array(z.string().url().max(2048)).max(32),
  }),
  z.strictObject({
    ...base,
    type: z.literal("run_terminal"),
    outcome: z.enum(["VERIFIED", "FAILED", "UNKNOWN", "CANCELLED"]),
    code: z.string().max(128).optional(),
    completion: panelCompletionSchema.optional(),
  }),
]);
export const panelResponseSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...decision,
    kind: z.literal("review"),
    decision: z.enum(["approve", "reject"]),
  }),
  z.strictObject({
    ...decision,
    kind: z.literal("permission"),
    decision: z.enum(["once", "always", "deny"]),
  }),
  z.strictObject({
    ...decision,
    kind: z.literal("value"),
    value: z.string().min(1).max(16384),
  }),
  z.strictObject({
    ...decision,
    kind: z.literal("confirmation"),
    decision: z.enum(["accept", "reject"]),
    confirmationId: panelId,
    nonce: panelId,
  }),
  z.strictObject({
    ...decision,
    kind: z.literal("consent"),
    allowed: z.boolean(),
  }),
  z.strictObject({
    ...decision,
    kind: z.literal("workflow.select"),
    candidateId: panelId,
  }),
  z.strictObject({ ...decision, kind: z.literal("workflow.start") }),
  z.strictObject({ ...decision, kind: z.literal("workflow.previewCode") }),
  z.strictObject({
    ...decision,
    kind: z.literal("workflow.analyze"),
    consent: z.literal(true),
  }),
  z.strictObject({ ...decision, kind: z.literal("workflow.dismiss") }),
  z.strictObject({
    ...decision,
    kind: z.literal("workflow.save"),
    candidateId: panelId,
    title: z.string().min(1).max(80),
  }),
]);
export type PanelEvent = z.infer<typeof panelEventSchema>;
export type PanelResponse = z.infer<typeof panelResponseSchema>;
export interface PanelClient {
  start(input: {
    requestId: string;
    text: string;
    mode: "ask" | "act";
  }): Promise<void>;
  respond(input: PanelResponse): Promise<void>;
  cancel(input: { requestId: string; runId?: string }): Promise<void>;
  clear(): Promise<void>;
}
