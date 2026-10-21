import { z } from "zod";
const id = z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const refSchema = z.strictObject({
  id,
  digest: hash,
  pageKey: id,
  graphRevision: z.number().int().nonnegative(),
  fields: z.array(z.string().min(1).max(200)).min(1).max(50),
});
export const requestSchema = z.strictObject({
  schema: z.literal("wca.analysis/v1"),
  taskId: id,
  attemptId: id,
  partitionId: id,
  taskRevision: z.number().int().nonnegative(),
  configDigest: hash,
  objective: z.string().min(1).max(2000),
  datasets: z.array(refSchema).min(1).max(16),
  criteria: z.array(z.string().min(1).max(200)).max(16),
  maxBytes: z.number().int().min(1).max(65536),
  deadline: z.number().int().nonnegative(),
});
export const findingSchema = z.strictObject({
  datasetId: id,
  digest: hash,
  evidenceIds: z.array(id).min(1).max(32),
  op: z.enum(["cell", "count", "sum", "min", "max", "average"]),
  field: z.string().max(200).nullable(),
  rowId: id.nullable(),
  value: z.union([
    z.string().max(4096),
    z.number().finite(),
    z.boolean(),
    z.null(),
  ]),
});
export const resultSchema = z.strictObject({
  schema: z.literal("wca.analysis/v1"),
  taskId: id,
  attemptId: id,
  inputDigest: hash,
  summary: z.string().max(4096),
  findings: z.array(findingSchema).max(32),
  limitations: z
    .array(z.enum(["PARTIAL_COVERAGE", "REDACTED", "MORE_DATA_REQUIRED"]))
    .max(3),
  recommendations: z.array(z.string().max(500)).max(8),
  additionalData: z
    .array(
      z.strictObject({
        datasetId: id,
        fields: z.array(z.string().min(1).max(200)).min(1).max(50),
        coverage: z.enum(["complete", "additional_rows"]),
      }),
    )
    .max(8),
});
export type AnalysisRequest = z.infer<typeof requestSchema>;
export type AnalysisResult = z.infer<typeof resultSchema>;
export type Finding = z.infer<typeof findingSchema>;
export interface AnalystReply {
  result: unknown;
  usage: { inputTokens: number; outputTokens: number };
}
export interface AnalystPort {
  analyze(
    input: AnalysisInput,
    signal: AbortSignal,
    beforeSend: () => Promise<void>,
  ): Promise<AnalystReply>;
}
export interface AnalysisInput {
  schema: "wca.analysis/v1";
  taskId: string;
  attemptId: string;
  objective: string;
  criteria: string[];
  inputDigest: string;
  configDigest: string;
  datasets: Projection[];
}
export interface Projection {
  id: string;
  digest: string;
  projectionDigest: string;
  fields: { name: string; type: string; unit: string | null }[];
  aggregates: {
    op: "count" | "sum" | "min" | "max" | "average";
    field: string | null;
    value: number | null;
  }[];
  rows: (string | number | boolean | null)[][];
  rowIds: string[];
  evidenceIds: string[];
  partial: boolean;
  redacted: boolean;
}
export const analysisInputSchema = z.strictObject({
  schema: z.literal("wca.analysis/v1"),
  taskId: id,
  attemptId: id,
  objective: z.string().min(1).max(2000),
  criteria: z.array(z.string().min(1).max(200)).max(16),
  inputDigest: hash,
  configDigest: hash,
  datasets: z
    .array(
      z.strictObject({
        id,
        digest: hash,
        projectionDigest: hash,
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
        aggregates: z
          .array(
            z.strictObject({
              op: z.enum(["count", "sum", "min", "max", "average"]),
              field: z.string().max(200).nullable(),
              value: z.number().finite().nullable(),
            }),
          )
          .max(201),
        rows: z
          .array(
            z
              .array(
                z.union([
                  z.string().max(4096),
                  z.number().finite(),
                  z.boolean(),
                  z.null(),
                ]),
              )
              .max(50),
          )
          .max(10000),
        rowIds: z.array(id).max(10000),
        evidenceIds: z.array(id).max(1000),
        partial: z.boolean(),
        redacted: z.boolean(),
      }),
    )
    .min(1)
    .max(16),
});
