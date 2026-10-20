export const normalize = (value: string, limit = 200): string =>
  value.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, limit);
export function scrub(value: string, limit = 200): string {
  if (value.length > 4096) return "[TRUNCATED]";
  return normalize(
    value
      .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED]")
      .replace(/\b(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]{16,})/gi, "[REDACTED]"),
    limit,
  );
}
export function denied(element: Element): boolean {
  const type = element.getAttribute("type")?.toLowerCase();
  const metadata = [
    element.getAttribute("autocomplete"),
    element.getAttribute("name"),
    element.getAttribute("id"),
    element.getAttribute("aria-label"),
  ].join(" ");
  return (
    element.hasAttribute("data-private") ||
    element.hasAttribute("data-sensitive") ||
    type === "password" ||
    type === "hidden" ||
    /password|secret|token|credit.?card|cc-number|one-time-code/i.test(
      metadata,
    ) ||
    ["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName)
  );
}
export function safeUrl(value: string, base: string): URL | null {
  try {
    const url = new URL(value, base);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

export function privateAncestor(element: Element): boolean {
  let node: Element | null = element;
  let count = 0;
  while (node && count++ < 64) {
    if (denied(node)) return true;
    node = node.parentElement;
  }
  return node !== null;
}
