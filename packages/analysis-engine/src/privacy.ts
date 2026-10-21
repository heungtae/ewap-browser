export function sanitize(value: string): string {
  return value
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "[REDACTED]")
    .replace(/\b(?:sk-|sk_)[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(
      /\b(?:password|api[_-]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "[REDACTED]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED]")
    .replace(/https?:\/\/[^\s"<>]+/gi, "[URL]");
}
export function safeLabel(value: string): string {
  if (
    sanitize(value) !== value ||
    /(?:locator|selector|approval|credential|password|token|secret|authorization|api.?key)/i.test(
      value,
    )
  )
    throw new Error("ANALYSIS_FORBIDDEN_FIELD");
  return value;
}
