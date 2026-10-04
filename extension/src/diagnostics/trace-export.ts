import { maskTraceValue } from "./trace-mask.js";
const object = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null && !Array.isArray(input);
const count = (input: unknown): input is number =>
  typeof input === "number" && Number.isSafeInteger(input) && input >= 0;
/** A content response may supply data, never widen the diagnostic record schema. */
export const safeMethodTraceSnapshot = (
  input: unknown,
  scope: "content" | "offscreen" = "content",
): Record<string, unknown> | undefined => {
  if (!object(input) || input.ok !== true || !object(input.trace)) return;
  const trace = input.trace;
  if (
    trace.schema_version !== 1 ||
    trace.scope !== scope ||
    !Array.isArray(trace.records) ||
    trace.records.length > 8_000 ||
    !Array.isArray(trace.methods) ||
    trace.methods.length > 4_000 ||
    !count(trace.dropped_count)
  )
    return;
  const methodName = (value: unknown): value is string =>
    typeof value === "string" &&
    /^(content|service-worker|providers|profile|policy|cdp|state|sidepanel|offscreen)\/[\w-]+\.ts:\d+:[\w.#?()[\]"', -]+$/.test(
      value,
    ) &&
    value.length < 300;
  const records = trace.records.filter(
    (record): record is Record<string, unknown> =>
      object(record) &&
      methodName(record.method) &&
      count(record.sequence) &&
      count(record.timestamp_ms) &&
      typeof record.call_id === "string" &&
      /^[a-zA-Z0-9-]{16,64}$/.test(record.call_id) &&
      ["debug", "trace", "error"].includes(String(record.level)) &&
      /^method\.(enter|input|exit|result|throw|branch|decision)$/.test(
        String(record.event),
      ),
  );
  const detail = (value: unknown) => {
    const raw = object(value) ? value : {};
    const remasked = maskTraceValue(raw.data);
    const report = object(raw.masking) ? raw.masking : {};
    const fields = Array.isArray(report.fields)
      ? report.fields
          .filter(
            (field): field is { path: string; reason: string; count: number } =>
              object(field) &&
              typeof field.path === "string" &&
              /^\$(?:\.[\w-]+|\[\d+\])*$/.test(field.path) &&
              typeof field.reason === "string" &&
              /^[a-z_]{1,40}$/.test(field.reason) &&
              count(field.count),
          )
          .slice(0, 80)
      : [];
    return {
      data: remasked.data,
      masking: {
        masked: report.masked === true || remasked.masking.masked,
        fields: [...fields, ...remasked.masking.fields].slice(0, 80),
        truncated: report.truncated === true || remasked.masking.truncated,
      },
    };
  };
  return {
    schema_version: 1,
    scope,
    level: ["trace", "debug", "info", "warn", "error"].includes(
      String(trace.level),
    )
      ? trace.level
      : "error",
    dropped_count: trace.dropped_count,
    records: records.map((record) => ({
      method: record.method,
      sequence: record.sequence,
      timestamp_ms: record.timestamp_ms,
      call_id: record.call_id,
      level: record.level,
      event: record.event,
      ...(typeof record.parent_call_id === "string" &&
      /^[a-zA-Z0-9-]{16,64}$/.test(record.parent_call_id)
        ? { parent_call_id: record.parent_call_id }
        : {}),
      ...(typeof record.duration_ms === "number" &&
      Number.isFinite(record.duration_ms) &&
      record.duration_ms >= 0
        ? { duration_ms: record.duration_ms }
        : {}),
      // Preserve the original masking report; re-mask it as untrusted data as well.
      detail: detail(record.detail),
    })),
    methods: trace.methods
      .filter(
        (method): method is Record<string, unknown> =>
          object(method) &&
          methodName(method.method) &&
          count(method.calls) &&
          count(method.completed) &&
          count(method.errors),
      )
      .map((method) => ({
        method: method.method,
        calls: method.calls,
        completed: method.completed,
        errors: method.errors,
      })),
    rejected_count: trace.records.length - records.length,
  };
};
