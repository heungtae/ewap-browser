import { z } from "zod";
export const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_.:-]+$/);
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const revision = z.number().int().nonnegative();
export const controls = [
  "INSPECT_MORE",
  "NEED_INPUT",
  "UNSUPPORTED",
  "UNKNOWN",
] as const;
export const phases = [
  "intent",
  "evidence_sufficiency",
  "semantic_selection",
  "semantic_relation",
  "next_tool",
  "processor",
  "recovery",
  "result_acceptance",
] as const;
export const tools = [
  "web.discover",
  "web.search_codebase",
  "web.inspect",
  "web.get_capabilities",
  "web.navigate",
  "web.switch_tab",
  "web.click",
  "web.fill",
  "web.select",
  "web.scroll",
  "web.wait_for",
  "web.extract",
  "web.query",
  "web.get_chart_data",
  "web.get_table_data",
  "web.get_observed_api",
  "analysis.run",
  "task.verify",
  "task.request_approval",
  "task.complete",
  "web.invoke_action",
] as const;
export const contextSchema = z.strictObject({
  taskId: id,
  taskRevision: revision,
  planRevision: revision,
  graphRevision: revision,
  evidenceRevision: revision,
  capabilityRevision: revision,
  cancellationGeneration: revision,
  mode: z.enum(["ask", "act"]),
  scopeId: id,
});
export const stepSchema = z.strictObject({
  id,
  tool: z.enum(tools),
  actionRef: id.optional(),
  dependencies: z.array(id).max(64),
  parameters: z.array(id).max(16),
  effect: z.enum(["read", "navigation", "local-ui", "external", "unknown"]),
  goalPredicateRefs: z.array(id).max(16),
  preconditionRefs: z.array(id).max(16),
});
export const candidateSchema = z.strictObject({
  id,
  semanticId: id,
  description: z.string().min(1).max(512),
  source: z.enum(["graph", "registered"]),
  scopeId: id,
  modes: z
    .array(z.enum(["ask", "act"]))
    .min(1)
    .max(2),
  capabilityRefs: z.array(id).max(16),
  evidenceRefs: z.array(id).max(16),
  unresolvedInputs: z.array(id).max(16),
  bindingDigests: z.record(id, digestSchema),
  steps: z.array(stepSchema).max(64),
  meaning: z
    .enum([
      "READ",
      "ACTION",
      "ANALYSIS",
      "RUNTIME",
      "GPT_ANALYSIS",
      "SEARCH_FORM",
      "FILTER_CONTROL",
      "RESULT_COLLECTION",
      "DETAIL_REGION",
      "UNRELATED",
      "ACCEPT",
      "REJECT",
      "INSPECT",
      "STOP",
      "REPLAN",
    ])
    .optional(),
});
export const cursorSchema = z.strictObject({
  sourceDigest: digestSchema,
  offset: revision,
  contextDigest: digestSchema,
});
export const pageSchema = z.strictObject({
  id,
  digest: digestSchema,
  sourceDigest: digestSchema,
  contextDigest: digestSchema,
  candidates: z.array(candidateSchema).max(28),
  totalEligible: revision,
  omitted: revision,
  cursor: cursorSchema.nullable(),
});
export const budgetSnapshotSchema = z.strictObject({
  version: z.literal("task-budget-v1"),
  calls: revision.max(24),
  inputTokens: revision.max(48000),
  outputTokens: revision.max(4000),
  activeMs: revision.max(180000),
  overallDeadline: revision,
  responseByteLimit: revision.max(1024),
});
export const framePayloadSchema = z.strictObject({
  protocol: z.literal("wca.task/v1"),
  templateVersion: z.literal("controller-v1"),
  model: z.string().min(1).max(128),
  modelRevision: revision,
  context: contextSchema,
  phase: z.enum(phases),
  candidateSet: pageSchema,
  budgets: budgetSnapshotSchema,
  facts: z
    .array(
      z.strictObject({
        id,
        value: z.union([
          z.string().max(2048),
          z.number().finite(),
          z.boolean(),
          z.null(),
        ]),
      }),
    )
    .max(64),
  stateComplete: z.boolean(),
});
export const decisionFrameSchema = framePayloadSchema.extend({
  digest: digestSchema,
});
export type DecisionContext = z.infer<typeof contextSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type CandidatePage = z.infer<typeof pageSchema>;
export type DecisionFrame = z.infer<typeof decisionFrameSchema>;
export type Phase = (typeof phases)[number];
export const jsonSchemas = {
  frame: z.toJSONSchema(decisionFrameSchema),
  candidate: z.toJSONSchema(candidateSchema),
};
