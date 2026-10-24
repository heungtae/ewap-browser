import { z } from "zod";
import { validDiagnostic } from "../../../../extension/src/contracts/diagnostics-validation.js";
import { migrationDigest } from "./migration-digest.js";
import { diagnosticsTtl } from "./mg06-convert.js";
import type { DiagnosticsRow } from "./mg06-staging.js";
const count = z.number().int().nonnegative().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const metadata = z
  .strictObject({
    sourceIndex: count,
    requestDigest: digest,
    workerDigest: digest,
    sequence: count.min(1),
    timestamp: count,
    expiresAt: count,
    component: z.string(),
    event: z.string(),
    level: z.string(),
    stage: z.string().optional(),
    outcome: z.string().optional(),
    code: z.string().optional(),
  })
  .refine(
    (row) =>
      row.expiresAt === row.timestamp + diagnosticsTtl &&
      validDiagnostic({
        schema_version: 1,
        sequence: row.sequence,
        timestamp_ms: row.timestamp,
        elapsed_ms: 0,
        worker_instance_id: "0000000000000000",
        request_id: "0000000000000000",
        component: row.component,
        event: row.event,
        level: row.level,
        ...(row.stage ? { stage: row.stage } : {}),
        ...(row.outcome ? { outcome: row.outcome } : {}),
        ...(row.code ? { code: row.code } : {}),
      }),
  );
const conversion = z
  .strictObject({
    schema: z.literal("wca.mg06-metadata/v1"),
    records: z.array(metadata).max(2000),
    quarantine: z
      .array(
        z.strictObject({
          sourceIndex: z.number().int().min(-1).safe(),
          reason: z.enum([
            "INVALID_CONTAINER",
            "INVALID_RECORD",
            "FUTURE_TIMESTAMP",
            "RETENTION_EXPIRED",
            "DUPLICATE_SEQUENCE",
          ]),
        }),
      )
      .max(2000),
    sourceCount: count,
  })
  .refine(
    (value) =>
      value.records.length + value.quarantine.length === value.sourceCount,
  );
const staged = z.strictObject({
  key: z.string().max(160),
  schema: z.literal("wca.mg06-stage/v1"),
  migrationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  epoch: count.min(1),
  createdAt: count,
  expiresAt: count,
  conversion,
  checkpoint: z.strictObject({
    sourceDigest: digest,
    targetDigest: digest,
    sourceCount: count,
    copied: count,
    quarantined: count,
  }),
});
const persisted = z.union([
  staged.refine(
    (row) =>
      row.expiresAt ===
        Math.min(
          row.createdAt + diagnosticsTtl,
          ...row.conversion.records.map((record) => record.expiresAt),
        ) &&
      row.conversion.records.every(
        (record) =>
          record.timestamp <= row.createdAt && record.expiresAt > row.createdAt,
      ) &&
      row.checkpoint.targetDigest === migrationDigest(row.conversion) &&
      row.checkpoint.sourceCount === row.conversion.sourceCount &&
      row.checkpoint.copied === row.conversion.records.length &&
      row.checkpoint.quarantined === row.conversion.quarantine.length,
  ),
  z.strictObject({ key: z.string().max(160), expired: z.literal(true) }),
]);
export function diagnosticsRow(value: unknown): DiagnosticsRow {
  if (!persisted.safeParse(value).success)
    throw new Error("MG06_METADATA_INVALID");
  return value as DiagnosticsRow;
}
