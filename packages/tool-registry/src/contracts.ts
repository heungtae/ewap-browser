import { z } from "zod";
import {
  contextSchema,
  effectSchema,
  hash,
  id,
  refSchema,
  revision,
} from "./identity.js";
import { toolIdSchema } from "./inputs.js";
export const preparedBodySchema = z.strictObject({
  schema: z.literal("wca.tool/v1"),
  kind: z.literal("prepared"),
  id,
  toolCallId: id,
  tool: toolIdSchema,
  toolVersion: z.literal(1),
  context: contextSchema,
  target: refSchema,
  bindingId: id,
  observationDigest: hash,
  argumentDigest: hash,
  argumentSourceDigest: hash,
  intentDigest: hash,
  predicate: refSchema.refine((r) => r.kind === "predicate"),
  effect: effectSchema,
  disclosureScope: hash.nullable(),
  expiresAt: revision,
});
export const preparedSchema = preparedBodySchema.extend({ digest: hash });
export const receiptSchema = z.strictObject({
  schema: z.literal("wca.tool/v1"),
  kind: z.literal("receipt"),
  toolCallId: id,
  tool: toolIdSchema,
  stepId: id,
  preparedDigest: hash,
  dispatchId: id,
  dispatch: z.enum(["not_dispatched", "reserved", "dispatched", "unknown"]),
  commands: z.number().int().nonnegative().max(64),
  verification: z.enum(["passed", "failed", "unknown", "not_run"]),
  evidenceDigest: hash.nullable(),
  error: z.string().max(128).nullable(),
  noOp: z.boolean(),
  goalVerified: z.literal(false),
});
export const promptSchema = z.strictObject({
  schema: z.literal("wca.policy/v1"),
  kind: z.literal("approval_request"),
  id,
  revision,
  toolCallId: id,
  taskId: id,
  preparedDigest: hash,
  contextDigest: hash,
  planRevision: revision,
  policyRevision: revision,
  windowId: revision,
  tool: toolIdSchema,
  effect: effectSchema,
  target: refSchema,
  argumentPreview: z.string().max(20000),
  disclosureScope: hash.nullable(),
  expiresAt: revision,
});
export const approvalSchema = z.strictObject({
  schema: z.literal("wca.policy/v1"),
  kind: z.literal("approval_receipt"),
  id,
  promptId: id.nullable(),
  source: z.enum(["user", "policy"]),
  taskId: id,
  stepId: id,
  preparedDigest: hash,
  contextDigest: hash,
  policyRevision: revision,
  planRevision: revision,
  runtimeEpoch: revision,
  cancellationGeneration: revision,
  effect: effectSchema,
  disclosureScope: hash.nullable(),
  expiresAt: revision,
});
export const responseSchema = z.strictObject({
  promptId: id,
  promptRevision: revision,
  preparedDigest: hash,
  contextDigest: hash,
  planRevision: revision,
  choice: z.enum(["approve", "deny"]),
  disclosureScope: hash.nullable(),
});
export type PreparedStep = z.infer<typeof preparedSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type ApprovalPrompt = z.infer<typeof promptSchema>;
export type ApprovalReceipt = z.infer<typeof approvalSchema>;
export type ApprovalResponse = z.infer<typeof responseSchema>;
