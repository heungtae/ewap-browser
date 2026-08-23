import { fail } from "../security/validation.js";
import type { ProviderConfig } from "./types.js";

const reservedHeaders = new Set([
  "content-type",
  "authorization",
  "api-key",
  "x-goog-api-key",
]);

const isPrivateIpv4 = (host: string): boolean => {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
};

export const validateProviderBaseUrl = (
  raw: string,
  privateNetworkOptIn = false,
): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  const host = url.hostname.toLowerCase();
  const loopback =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  const privateNetwork = isPrivateIpv4(host);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        (loopback || (privateNetwork && privateNetworkOptIn))
      )) ||
    (privateNetwork && !privateNetworkOptIn)
  )
    return fail("INVALID_ARGUMENT");
  return url;
};

const headerValue = (value: string): string =>
  value.length > 0 &&
  value.length <= 4096 &&
  ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })
    ? value
    : fail("INVALID_ARGUMENT");

export const providerHeaders = (config: ProviderConfig): Headers => {
  const headers = new Headers({ "Content-Type": "application/json" });
  const seen = new Set<string>();
  for (const header of config.headers) {
    const name = header.name.trim().toLowerCase();
    if (
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) ||
      reservedHeaders.has(name) ||
      seen.has(name)
    )
      fail("INVALID_ARGUMENT");
    seen.add(name);
    headers.set(header.name, headerValue(header.value));
  }
  if (config.api_key_header === "none") {
    if (config.api_key) fail("INVALID_ARGUMENT");
  } else {
    const key = headerValue(config.api_key);
    if (config.api_key_header === "authorization_bearer")
      headers.set("Authorization", `Bearer ${key}`);
    else headers.set(config.api_key_header, key);
  }
  return headers;
};

export const safeProviderErrorDetail = async (
  response: Response,
): Promise<string> => {
  const status = `HTTP ${response.status}`;
  try {
    const error = (JSON.parse(await response.text()) as { error?: unknown })
      .error;
    if (!error || typeof error !== "object") return status;
    const code =
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    const message =
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
            .replace(/(?:sk|sess)-[A-Za-z0-9_-]+/g, "[REDACTED]")
            .replace(/[\r\n\t]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 320)
        : undefined;
    return [status, code, message].filter(Boolean).join("; ");
  } catch {
    return status;
  }
};
