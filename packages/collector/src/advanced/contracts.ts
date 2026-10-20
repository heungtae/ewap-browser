import { z } from "zod";
import {
  contextSchema,
  hash,
  id,
  revision,
  cellSchema,
} from "@contextpilot/codebase-schema";
export const bindingSchema = contextSchema;
export const coverageSchema = z.strictObject({
  status: z.enum(["complete", "partial", "viewport_only", "unavailable"]),
  reasons: z
    .array(
      z
        .string()
        .regex(/^[A-Z_]+$/)
        .max(64),
    )
    .max(24),
  total: revision.nullable(),
  windows: revision.max(50),
  restored: z.boolean().nullable(),
});
export const advancedBodySchema = z
  .strictObject({
    schema: z.literal("wca.collector/v1"),
    id,
    context: bindingSchema,
    kind: z.enum(["table", "chart", "ax", "network", "source", "frames"]),
    provenance: z.enum([
      "dom",
      "ax",
      "registered",
      "network_observed",
      "static_source",
      "visual_inferred",
    ]),
    rows: z.array(z.array(cellSchema).max(50)).max(10000),
    rowIds: z.array(id).max(10000),
    fields: z.array(z.string().min(1).max(200)).max(50),
    coverage: coverageSchema,
    observedAt: revision,
    expiresAt: revision,
    executable: z.literal(false),
  })
  .superRefine((d, c) => {
    if (
      d.rows.length !== d.rowIds.length ||
      new Set(d.rowIds).size !== d.rowIds.length ||
      d.rows.some((r) => r.length !== d.fields.length)
    )
      c.addIssue({ code: "custom", message: "DATA_SHAPE" });
    if (
      d.coverage.status === "complete" &&
      (d.coverage.reasons.length ||
        d.coverage.total !== d.rows.length ||
        d.provenance === "visual_inferred")
    )
      c.addIssue({ code: "custom", message: "FALSE_COMPLETE" });
    if (d.expiresAt <= d.observedAt || d.expiresAt > d.observedAt + 86400000)
      c.addIssue({ code: "custom", message: "EVIDENCE_TTL" });
  });
export const advancedSchema = advancedBodySchema.extend({ digest: hash });
export type AdvancedBody = z.infer<typeof advancedBodySchema>;
export type AdvancedEvidence = z.infer<typeof advancedSchema>;
