/**
 * Keep chat persistence and provider egress from becoming a second secret
 * store. This is intentionally conservative: it removes common credential
 * values but preserves enough surrounding text for a useful conversation.
 */
const replacements: ReadonlyArray<[RegExp, string]> = [
  [/(?:bearer\s+)[A-Za-z0-9._~+/-]{8,}/gi, "Bearer [REDACTED]"],
  [/(?:sk-|rk_|pk_)[A-Za-z0-9_-]{12,}/g, "[REDACTED_KEY]"],
  [
    /(?:api[_ -]?key|authorization|password|비밀번호|otp|one[ -]?time[ -]?code|recovery[ -]?code)\s*[:=]\s*[^\s,;]+/gi,
    "$&",
  ],
];

const redactAssignment = (value: string): string =>
  value.replace(
    /((?:api[_ -]?key|authorization|password|비밀번호|otp|one[ -]?time[ -]?code|recovery[ -]?code)\s*[:=]\s*)[^\s,;]+/gi,
    "$1[REDACTED]",
  );

export const redactForChat = (value: string, limit = 16_000): string => {
  let redacted = value;
  for (const [pattern, replacement] of replacements) {
    // The assignment pattern is handled separately to retain its label.
    if (replacement === "$&") continue;
    redacted = redacted.replace(pattern, replacement);
  }
  return redactAssignment(redacted)
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      // Newlines carry safe Markdown block structure; removing them turns a
      // persisted list into one unrenderable paragraph on thread recovery.
      if (character === "\n" || character === "\r" || character === "\t")
        return character;
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s{3,}/g, "  ")
    .slice(0, limit);
};

export const canonicalPageScope = (
  value: string | undefined,
): { origin: string; path: string } | undefined => {
  try {
    const parsed = new URL(value ?? "");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    return { origin: parsed.origin, path: parsed.pathname || "/" };
  } catch {
    return;
  }
};
