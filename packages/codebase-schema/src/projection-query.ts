import { z } from "zod";
import { cellSchema, querySchema } from "./dataset.js";
import { coverageSchema, hash, id, revision } from "./common.js";
import { entitySchema } from "./graph.js";
export const projectionOperationSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("search"),
    name: z.string().max(200),
    entityKind: entitySchema.shape.kind.optional(),
    limit: revision.min(1).max(128),
    after: id.nullable(),
  }),
  z.strictObject({
    kind: z.literal("inspect"),
    id,
    includeSample: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("dataset"), id, digest: hash }),
  z.strictObject({
    kind: z.literal("query"),
    id,
    digest: hash,
    query: querySchema,
  }),
]);
const lineage = {
  datasetId: id,
  partitionId: id,
  pageKey: id,
  evidenceIds: z.array(id).max(1000),
  observedAt: revision,
  expiresAt: revision,
  digest: hash,
  graphRevision: revision,
  coverage: coverageSchema,
  matchedRows: revision.max(10000),
};
const group = { key: cellSchema, count: revision.max(10000) };
export const projectionQueryResultSchema = z.union([
  z.strictObject({
    ...lineage,
    value: revision.max(10000),
    precision: z.literal("exact_count"),
  }),
  z.strictObject({
    ...lineage,
    fields: z.array(z.string().max(200)).max(50),
    rows: z.array(z.array(cellSchema).max(50)).max(1000),
    truncated: z.boolean(),
  }),
  z.strictObject({
    ...lineage,
    value: z.number().finite().nullable(),
    nullsExcluded: revision.max(10000),
    precision: z.literal("ieee754_compensated_sum"),
    unit: z.string().max(32).nullable(),
  }),
  z.strictObject({
    ...lineage,
    field: z.string().max(200),
    groups: z.array(z.strictObject(group)).max(1000),
    totalGroups: revision.max(10000),
    truncated: z.boolean(),
    precision: z.literal("exact_count"),
  }),
  z.strictObject({
    ...lineage,
    field: z.string().max(200),
    groups: z
      .array(
        z.strictObject({
          ...group,
          value: z.number().finite().nullable(),
          nullsExcluded: revision.max(10000),
        }),
      )
      .max(1000),
    totalGroups: revision.max(10000),
    truncated: z.boolean(),
    aggregate: z.strictObject({
      op: z.enum(["sum", "min", "max", "average"]),
      field: z.string().max(200),
    }),
    unit: z.string().max(32).nullable(),
    precision: z.enum(["ieee754_comparison", "ieee754_compensated_sum"]),
  }),
]);
export type ProjectionOperation = z.infer<typeof projectionOperationSchema>;
