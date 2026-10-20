import { z } from "zod";
import { coverageSchema, hash, id, revision } from "./common.js";
export const cellSchema = z.union([
  z.string().max(4096),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const datasetBodySchema = z
  .strictObject({
    schema: z.literal("wca.codebase/v1"),
    kind: z.literal("dataset"),
    id,
    partitionId: id,
    pageKey: id,
    graphRevision: revision,
    fields: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(200),
          type: z.enum(["unknown", "string", "number", "boolean", "union"]),
          unit: z.string().max(32).nullable(),
        }),
      )
      .min(1)
      .max(50),
    rows: z.array(z.array(cellSchema).max(50)).max(10000),
    rowIds: z.array(id).max(10000),
    coverage: coverageSchema,
    source: z.enum(["level1_sample", "static", "advisory"]),
    evidenceIds: z.array(id).max(1000),
    observedAt: revision,
    expiresAt: revision,
  })
  .superRefine((d, c) => {
    if (
      d.coverage.emitted !== d.rows.length ||
      (d.coverage.status === "complete" && d.coverage.total !== d.rows.length)
    )
      c.addIssue({ code: "custom", message: "DATASET_COUNTS" });

    if (
      d.rows.length !== d.rowIds.length ||
      new Set(d.rowIds).size !== d.rowIds.length ||
      d.rows.some((r) => r.length !== d.fields.length) ||
      new Set(d.fields.map((f) => f.name)).size !== d.fields.length
    )
      c.addIssue({ code: "custom", message: "DATASET_SHAPE" });
    if (d.source !== "static" && d.coverage.status === "complete")
      c.addIssue({ code: "custom", message: "SAMPLE_NOT_COMPLETE" });
    if (d.expiresAt > d.observedAt + 86400000 || d.expiresAt <= d.observedAt)
      c.addIssue({ code: "custom", message: "DATASET_TTL" });
  });
export const datasetSchema = datasetBodySchema.extend({ digest: hash });
export const querySchema = z.strictObject({
  op: z.enum(["project", "count", "sum", "min", "max", "average"]),
  fields: z.array(z.string().max(200)).max(50),
  filters: z
    .array(z.strictObject({ field: z.string().max(200), equals: cellSchema }))
    .max(20),
  limit: z.number().int().min(1).max(1000),
});
export type Dataset = z.infer<typeof datasetSchema>;
export type DatasetBody = z.infer<typeof datasetBodySchema>;
