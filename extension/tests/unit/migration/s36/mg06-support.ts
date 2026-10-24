export const diagnosticsNow = 1_800_000_000_000;
export function diagnosticRecord(patch: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    sequence: 1,
    timestamp_ms: diagnosticsNow - 1000,
    worker_instance_id: "PRIVATE-WORKER-CANARY",
    request_id: "PRIVATE-REQUEST-CANARY",
    component: "act",
    event: "request.terminal",
    level: "error",
    elapsed_ms: 12,
    outcome: "UNKNOWN",
    message: "CANARY_RAW_DIAGNOSTIC_MESSAGE",
    ...patch,
  };
}
export function diagnosticsSource() {
  return {
    execution_diagnostics_v1: {
      level: "trace",
      records: [diagnosticRecord()],
      dropped_count: 0,
      debug_until_ms: diagnosticsNow + 60_000,
    },
  };
}
