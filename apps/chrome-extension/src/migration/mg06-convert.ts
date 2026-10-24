import { validDiagnostic } from "../../../../extension/src/contracts/diagnostics-validation.js";
import { isPlainObject } from "../../../../extension/src/security/validation.js";
import { migrationDigest } from "./migration-digest.js";
export const diagnosticsTtl = 30 * 60_000;
export type DiagnosticsSnapshot = { execution_diagnostics_v1?: unknown };
export function convertMg06(snapshot: DiagnosticsSnapshot, now: number) {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("MG06_CLOCK");
  const records: {
    sourceIndex: number;
    requestDigest: string;
    workerDigest: string;
    sequence: number;
    timestamp: number;
    expiresAt: number;
    component: string;
    event: string;
    level: string;
    stage?: string;
    outcome?: string;
    code?: string;
  }[] = [];
  const quarantine: { sourceIndex: number; reason: string }[] = [];
  const value = snapshot.execution_diagnostics_v1;
  if (value === undefined || value === null)
    return {
      schema: "wca.mg06-metadata/v1" as const,
      records,
      quarantine,
      sourceCount: 0,
    };
  if (
    !isPlainObject(value) ||
    !Array.isArray(value.records) ||
    value.records.length > 2000 ||
    Object.keys(value).some(
      (key) =>
        !["level", "records", "dropped_count", "debug_until_ms"].includes(key),
    ) ||
    !["error", "warn", "info", "debug", "trace", "off", "basic"].includes(
      String(value.level),
    ) ||
    typeof value.level !== "string" ||
    !Number.isSafeInteger(value.dropped_count) ||
    (value.dropped_count as number) < 0 ||
    typeof value.debug_until_ms !== "number" ||
    !Number.isFinite(value.debug_until_ms) ||
    value.debug_until_ms < 0
  ) {
    quarantine.push({ sourceIndex: -1, reason: "INVALID_CONTAINER" });
    return {
      schema: "wca.mg06-metadata/v1" as const,
      records,
      quarantine,
      sourceCount: 1,
    };
  }
  const seen = new Set<string>();
  for (const [sourceIndex, row] of value.records.entries()) {
    if (
      !validDiagnostic(row) ||
      !Number.isSafeInteger(row.sequence) ||
      row.sequence < 1 ||
      !Number.isSafeInteger(row.timestamp_ms) ||
      ![row.component, row.event, row.level].every(
        (field) => typeof field === "string",
      ) ||
      [row.stage, row.outcome, row.code, row.reason].some(
        (field) => field !== undefined && typeof field !== "string",
      )
    ) {
      quarantine.push({ sourceIndex, reason: "INVALID_RECORD" });
      continue;
    }
    if (row.timestamp_ms > now || now - row.timestamp_ms >= diagnosticsTtl) {
      quarantine.push({
        sourceIndex,
        reason:
          row.timestamp_ms > now ? "FUTURE_TIMESTAMP" : "RETENTION_EXPIRED",
      });
      continue;
    }
    const identity = migrationDigest([row.worker_instance_id, row.sequence]);
    if (seen.has(identity)) {
      quarantine.push({ sourceIndex, reason: "DUPLICATE_SEQUENCE" });
      continue;
    }
    seen.add(identity);
    records.push({
      sourceIndex,
      requestDigest: migrationDigest(row.request_id),
      workerDigest: migrationDigest(row.worker_instance_id),
      sequence: row.sequence,
      timestamp: row.timestamp_ms,
      expiresAt: row.timestamp_ms + diagnosticsTtl,
      component: row.component,
      event: row.event,
      level: row.level,
      ...(row.stage ? { stage: row.stage } : {}),
      ...(row.outcome ? { outcome: row.outcome } : {}),
      ...(row.code ? { code: row.code } : {}),
    });
  }
  return {
    schema: "wca.mg06-metadata/v1" as const,
    records,
    quarantine,
    sourceCount: value.records.length,
  };
}
export type DiagnosticsConversion = ReturnType<typeof convertMg06>;
