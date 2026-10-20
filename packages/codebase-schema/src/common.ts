import { z } from "zod";
export const id = z.string().regex(/^[a-z][a-z0-9_-]{1,127}$/);
export const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const revision = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const coverageSchema = z
  .strictObject({
    status: z.enum(["complete", "partial", "viewport_only", "unavailable"]),
    examined: revision,
    emitted: revision,
    omitted: revision,
    redactions: revision,
    total: revision.nullable(),
    reasons: z
      .array(
        z.enum([
          "NODE_LIMIT",
          "OUTPUT_LIMIT",
          "BYTE_LIMIT",
          "COMPONENT_LIMIT",
          "ACTION_LIMIT",
          "ROUTE_LIMIT",
          "SAMPLE_ONLY",
          "CELL_TRUNCATED",
          "DENIED_REGION",
          "FRAME_UNAVAILABLE",
          "SHADOW_UNAVAILABLE",
          "UNIT_TIMEOUT",
          "CANCELLED",
          "DOCUMENT_CHANGED",
          "PAGE_UNSTABLE",
        ]),
      )
      .max(16),
    startedAt: revision,
    endedAt: revision,
    deadline: revision,
  })
  .superRefine((c, ctx) => {
    if (
      c.status === "complete" &&
      (c.omitted || c.reasons.length || c.total === null)
    )
      ctx.addIssue({ code: "custom", message: "FALSE_COMPLETE" });
    if (c.endedAt < c.startedAt || c.emitted > c.examined)
      ctx.addIssue({ code: "custom", message: "INVALID_COUNTS" });
  });
export const sourceSchema = z.strictObject({
  tabId: revision,
  frameId: revision,
  documentEpoch: revision,
  routeEpoch: revision,
  sourceRevision: revision,
  sequence: revision,
  cancellationGeneration: revision,
});
export const contextSchema = z.strictObject({
  taskId: id,
  partitionId: id,
  pageKey: id,
  profileGuard: hash,
  origin: z.string().url().max(2048),
  accountKnown: z.boolean(),
  source: sourceSchema,
});
export const fieldSchema = z.strictObject({
  name: z.string().max(200),
  type: z.enum(["unknown", "string", "number", "boolean", "union"]),
  required: z.boolean().nullable(),
  unit: z.string().max(32).nullable(),
});
export const capabilitySchema = z.strictObject({
  tool: z.enum(["web.click", "web.navigate", "web.fill", "web.select"]),
  mode: z.literal("act"),
  mechanism: z.enum(["navigate", "edit_control", "invoke_registered"]),
  businessEffect: z.literal("unknown"),
  executable: z.literal(false),
  reason: z.literal("FRESH_BINDING_AND_POLICY_REQUIRED"),
  verifier: z.string().max(64),
  parameter: z.strictObject({
    type: z.enum(["none", "string", "selection"]),
    required: z.boolean(),
    min: z.string().max(64).nullable(),
    max: z.string().max(64).nullable(),
    step: z.string().max(64).nullable(),
    pattern: z.string().max(200).nullable(),
    options: z.array(z.string().max(200)).max(20),
  }),
});
export type Coverage = z.infer<typeof coverageSchema>;
export type Context = z.infer<typeof contextSchema>;
export type Capability = z.infer<typeof capabilitySchema>;
