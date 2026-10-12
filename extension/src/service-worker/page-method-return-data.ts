import type { PageMethodReturnData } from "../contracts/page-method-types.js";
import { redactForChat } from "../security/chat-redaction.js";
import { isSensitive } from "../security/redaction.js";

/** Input is the bounded JSON projection, never the original page object. */
export const preparePageMethodReturnData = (
  data: PageMethodReturnData,
): PageMethodReturnData => {
  if (!data.available) return { available: false };
  let masked = false;
  const visit = (value: unknown): unknown => {
    if (typeof value === "string") {
      const safe = redactForChat(value, 8192);
      masked ||= safe !== value;
      return safe;
    }
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object") {
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, item] of Object.entries(value)) {
        if (
          isSensitive("text", key) ||
          /token|credential|api.?key|authorization|secret/i.test(key)
        ) {
          result[key] = "[REDACTED]";
          masked = true;
        } else result[key] = visit(item);
      }
      return result;
    }
    return value;
  };
  const raw = JSON.stringify(visit(data.value)) ?? "null";
  const bytes = new TextEncoder().encode(raw);
  const truncated = data.truncated === true || bytes.length > 8192;
  const value =
    bytes.length > 8192
      ? new TextDecoder().decode(bytes.subarray(0, 8189))
      : raw;
  return {
    ...data,
    value,
    masked,
    truncated,
    utf8_bytes: new TextEncoder().encode(value).length,
  };
};
