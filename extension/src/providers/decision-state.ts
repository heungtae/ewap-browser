import { redactForChat } from "../security/chat-redaction.js";
const blocked =
  /^(?:api[_-]?key|authorization|headers|cookies?|password|secrets?|credentials?|tokens?|scripts?|source_text|raw_source|html|image_data_urls|images?|data_url|transcript|messages)$/i;
/** Build decision state from explicit caller packets, never entire chat transcripts. */
export const safeDecisionState = (
  state: Record<string, unknown>,
): Record<string, unknown> => {
  const visit = (value: unknown): unknown => {
    if (typeof value === "string")
      return redactForChat(value, value.length).replace(
        /data:[^\s"'<>]+/gi,
        "[REDACTED_DATA_URI]",
      );
    if (Array.isArray(value)) return value.map(visit);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          blocked.test(k) ? "[REDACTED]" : visit(v),
        ]),
      );
    return value;
  };
  return visit(state) as Record<string, unknown>;
};
