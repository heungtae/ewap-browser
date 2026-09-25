import { fail } from "../security/validation.js";
import { AUTH_SCHEMES, type ProviderConfig } from "./types.js";
export { validateProviderBaseUrl } from "./provider-network-url.js";

const reservedHeaders = new Set([
  "content-type",
  "authorization",
  "api-key",
  "x-goog-api-key",
]);

const headerValue = (value: string): string =>
  value.trim().length > 0 &&
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
      header.name !== header.name.trim() ||
      !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)
    )
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
  if (!AUTH_SCHEMES.includes(config.api_key_header)) fail("INVALID_ARGUMENT");
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

export const safeProviderErrorDetail = (response: Response): string =>
  `HTTP ${response.status}`;
