import { maskTraceValue } from "./trace-mask.js";
import type { DiagnosticsLevel } from "../contracts/diagnostic-types.js";
import { correlation, type MethodContext } from "./trace-context.js";
export type RecordEntry = {
  sequence: number;
  timestamp_ms: number;
  level: "debug" | "trace" | "error";
  event: string;
  method: string;
  call_id: string;
  parent_call_id?: string;
  duration_ms?: number;
  detail: ReturnType<typeof maskTraceValue>;
  context: MethodContext;
};
const records: RecordEntry[] = [];
const sizes = new WeakMap<RecordEntry, number>();
let retainedBytes = 0;
let sampledDropped = 0;
const retained = new Map<string, RecordEntry>();
export const methods = new Map<
  string,
  {
    calls: number;
    completed: number;
    errors: number;
    total_ms: number;
    last_call_id: string;
  }
>();
let sequence = 0;
let bytes = 0;
let dropped = 0;
let level: DiagnosticsLevel = "trace";
let expires = Date.now() + 30 * 60_000;
const rank = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

export const setMethodTraceLevel = (next: DiagnosticsLevel): void => {
  level = next;
  expires = Date.now() + 30 * 60_000;
  for (let index = records.length - 1; index >= 0; index--) {
    if (rank[records[index]!.level] > rank[next]) {
      bytes -= sizes.get(records[index]!) ?? 0;
      records.splice(index, 1);
    }
  }
  for (const [key, entry] of retained)
    if (rank[entry.level] > rank[next]) {
      retainedBytes -= sizes.get(entry) ?? 0;
      retained.delete(key);
    }
};
export const append = (
  context: MethodContext,
  method: string,
  event: string,
  eventLevel: RecordEntry["level"],
  input: unknown,
  duration?: number,
): void => {
  if ((level === "debug" || level === "trace") && Date.now() >= expires)
    setMethodTraceLevel("error");
  if (rank[eventLevel] > rank[level]) return;
  try {
    const dataCallback =
      /(?:collection|analysis-data|page-api-read)/.test(method) &&
      /(?:callback|cell|record)/i.test(method.split(":")[2] ?? "");
    const sensitiveData =
      dataCallback &&
      typeof input !== "boolean" &&
      typeof input !== "number" &&
      (event === "method.input" || event === "method.result");
    const entry: RecordEntry = {
      sequence: ++sequence,
      timestamp_ms: Date.now(),
      level: eventLevel,
      event,
      method,
      call_id: context.call_id,
      ...(context.parent ? { parent_call_id: context.parent.call_id } : {}),
      ...(duration === undefined ? {} : { duration_ms: duration }),
      detail: maskTraceValue(
        sensitiveData ||
          /(?:insertText|typeText|screenshot|captureVisibleTab|submitValue)/i.test(
            method,
          )
          ? { value: input }
          : input,
      ),
      context,
    };
    const size = JSON.stringify({
      ...entry,
      context: correlation(context),
    }).length;
    // Keep the latest event for each method and request even if hot-loop records
    // evict the chronological buffer. Counts explain how many calls were sampled.
    const owner = correlation(context);
    const key = `${owner.request_id ?? "document"}:${method}:${event}`;
    sizes.set(entry, size);
    if (size <= 32_000) {
      const previous = retained.get(key);
      if (previous) retainedBytes -= sizes.get(previous) ?? 0;
      retained.set(key, entry);
      retainedBytes += size;
    }
    while (retained.size > 4_000 || retainedBytes > 8_000_000) {
      const oldest = retained.keys().next().value!;
      retainedBytes -= sizes.get(retained.get(oldest)!) ?? 0;
      retained.delete(oldest);
      sampledDropped++;
    }
    records.push(entry);
    bytes += size;
    while (records.length > 4_000 || bytes > 4_000_000) {
      const removed = records.shift()!;
      bytes -= sizes.get(removed) ?? 0;
      dropped++;
    }
  } catch {
    dropped++;
  }
};

export const getTraceState = () => ({
  records,
  retained,
  methods,
  level,
  expires,
  dropped,
  sampledDropped,
});
