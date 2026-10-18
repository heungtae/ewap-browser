import type { MaskReport } from "./trace-value-types.js";

/** Serialize captured values without redaction, getters or arbitrary toJSON calls. */
export const rawTraceValue = (
  input: unknown,
): { data: unknown; masking: MaskReport } => {
  const masking: MaskReport = { masked: false, fields: [], truncated: false };
  const seen = new WeakSet<object>();
  let budget = 128_000;
  let nodes = 8_000;
  const truncated = (): string => {
    masking.truncated = true;
    return "[TRUNCATED]";
  };
  const visit = (value: unknown, depth: number): unknown => {
    if (--nodes < 0) return truncated();
    if (value === null || value === undefined) return value ?? null;
    if (typeof value === "boolean" || typeof value === "number") return value;
    if (budget <= 0 || depth > 12) return truncated();
    if (typeof value === "string") {
      const limit = Math.min(64_000, budget);
      budget -= Math.min(value.length, limit);
      return value.length > limit ? value.slice(0, limit) + truncated() : value;
    }
    if (typeof value !== "object") return `[${typeof value}]`;
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    if (Array.isArray(value)) {
      if (value.length > 128) masking.truncated = true;
      return Array.from({ length: Math.min(value.length, 128) }, (_, index) => {
        const item = Object.getOwnPropertyDescriptor(value, String(index));
        return item && "value" in item
          ? visit(item.value, depth + 1)
          : item
            ? "[ACCESSOR_NOT_READ]"
            : null;
      });
    }
    const prototype = Object.getPrototypeOf(value);
    if (
      prototype !== Object.prototype &&
      prototype !== null &&
      !(value instanceof Error)
    )
      return "[UNSUPPORTED_OBJECT]";
    const fields = Object.entries(Object.getOwnPropertyDescriptors(value));
    if (fields.length > 128) masking.truncated = true;
    const result = Object.create(null) as Record<string, unknown>;
    for (const [key, descriptor] of fields.slice(0, 128)) {
      if (budget <= 0) {
        truncated();
        break;
      }
      const boundedKey = visit(key, depth + 1) as string;
      result[boundedKey] =
        "value" in descriptor
          ? visit(descriptor.value, depth + 1)
          : "[ACCESSOR_NOT_READ]";
    }
    return result;
  };
  return { data: visit(input, 0), masking };
};
