import { digest, bytes } from "@contextpilot/codebase-schema";
import { scrub } from "../dom/privacy.js";
export interface NetworkMetadata {
  id: string;
  endpoint: string;
  method: string;
  status: number;
  mime: string;
  observed: true;
  executable: false;
}
export async function networkMetadata(
  input: {
    requestId: string;
    url: string;
    method: string;
    status: number;
    mime: string;
  },
  origin: string,
): Promise<NetworkMetadata> {
  if (input.url.length > 2048 || input.requestId.length > 256)
    throw new Error("NETWORK_INPUT_LIMIT");
  const url = new URL(input.url);
  if (
    url.origin !== origin ||
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("NETWORK_SCOPE");
  const endpoint = `observed_${(await digest(url.pathname)).slice(0, 32)}`;
  return {
    id: `api_${(await digest(input.requestId)).slice(0, 32)}`,
    endpoint,
    method: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ].includes(input.method)
      ? input.method
      : "OTHER",
    status:
      Number.isInteger(input.status) &&
      input.status >= 100 &&
      input.status <= 599
        ? input.status
        : 0,
    mime: input.mime
      .split(";")[0]!
      .slice(0, 80)
      .replace(/[^a-zA-Z0-9/+.-]/g, ""),
    observed: true,
    executable: false,
  };
}
export function responseRows(
  body: string,
  fields: readonly string[],
): (string | number | boolean | null)[][] {
  if (
    bytes(body) > 262144 ||
    fields.length > 50 ||
    new Set(fields).size !== fields.length ||
    fields.some(
      (f) =>
        !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(f) ||
        /password|secret|token|cookie|auth|email|session|credential/i.test(f),
    )
  )
    throw new Error("RESPONSE_SCOPE");
  const data: unknown = JSON.parse(body);
  if (!Array.isArray(data) || data.length > 200)
    throw new Error("RESPONSE_ROW_LIMIT");
  return data.map((row) =>
    fields.map((field) => {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new Error("RESPONSE_SHAPE");
      const value: unknown = Object.getOwnPropertyDescriptor(row, field)?.value;
      if (value === undefined || value === null) return null;
      if (typeof value === "string") return scrub(value, 4096);
      if (
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
      )
        return value;
      throw new Error("RESPONSE_SHAPE");
    }),
  );
}
