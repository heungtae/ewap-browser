import { fail, isPlainObject } from "../security/validation.js";
import type { ProviderConfig } from "../providers/types.js";

export const mergeWriteOnlyProvider = (
  previous: ProviderConfig | undefined,
  input: unknown,
): ProviderConfig => {
  const value = isPlainObject(input) ? input : fail("INVALID_ARGUMENT");
  if (!Array.isArray(value.headers)) fail("INVALID_ARGUMENT");
  const sameBoundary =
    previous !== undefined &&
    previous.plugin_id === value.plugin_id &&
    previous.plugin_version === value.plugin_version &&
    previous.base_url === value.base_url &&
    previous.api_key_header === value.api_key_header;
  if (value.api_key_header === "none" && value.api_key)
    return fail("INVALID_ARGUMENT");
  const apiKey =
    value.api_key_header === "none"
      ? ""
      : typeof value.api_key === "string" && value.api_key.length > 0
        ? value.api_key
        : sameBoundary
          ? previous.api_key
          : "";
  const inputHeaders = value.headers as unknown[];
  const headers = inputHeaders.map((raw: unknown) => {
    if (!isPlainObject(raw) || typeof raw.name !== "string")
      return fail("INVALID_ARGUMENT");
    const name = raw.name as string;
    const supplied = raw.value;
    const preserved = sameBoundary
      ? previous.headers.find(
          (item) => item.name.toLowerCase() === name.toLowerCase(),
        )?.value
      : undefined;
    return {
      name,
      value:
        typeof supplied === "string" && supplied.length > 0
          ? supplied
          : (preserved ?? ""),
    };
  });
  return { ...value, api_key: apiKey, headers } as ProviderConfig;
};
