export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}
export const bytes = (value: unknown): number =>
  new TextEncoder().encode(canonical(value)).byteLength;
export async function digest(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(canonical(value));
  const result = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(result)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function opaque(prefix: string, value: unknown): Promise<string> {
  return `${prefix}_${(await digest(value)).slice(0, 40)}`;
}
