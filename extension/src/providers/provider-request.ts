import { fail } from "../security/validation.js";
import type { ProviderConfig } from "./types.js";

const reservedHeaders = new Set([
  "content-type",
  "authorization",
  "api-key",
  "x-goog-api-key",
]);

export const validateProviderBaseUrl = (
  raw: string,
  privateNetworkOptIn = false,
): URL => {
  void privateNetworkOptIn;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && url.protocol !== "http:")
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
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name))
      fail("INVALID_ARGUMENT", "custom header name is invalid");
    if (reservedHeaders.has(name))
      fail(
        "INVALID_ARGUMENT",
        `custom header ${header.name} is managed by the authentication setting`,
      );
    if (seen.has(name))
      fail("INVALID_ARGUMENT", `custom header ${header.name} is duplicated`);
    seen.add(name);
    headers.set(header.name, headerValue(header.value));
  }
  if (config.api_key_header === "none") {
    if (config.api_key)
      fail(
        "INVALID_ARGUMENT",
        "API key must be empty when authentication is none",
      );
  } else {
    const key = config.api_key
      ? headerValue(config.api_key)
      : fail(
          "INVALID_ARGUMENT",
          "API key is required by the authentication setting",
        );
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
