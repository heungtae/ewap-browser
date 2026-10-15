import { fail, isPlainObject } from "../security/validation.js";
import { openAiCompatibleAdapter } from "./openai-compatible.js";
import { AUTH_SCHEMES, WIRE_APIS, type ProviderAdapter } from "./types.js";

export const resolveOpenAiCompatible = (value: unknown): ProviderAdapter => {
  if (
    !isPlainObject(value) ||
    (value.kind !== undefined && value.kind !== "openai_compatible") ||
    !WIRE_APIS.some((api) => api === value.wire_api) ||
    !AUTH_SCHEMES.some((scheme) => scheme === value.api_key_header)
  )
    return fail("INVALID_ARGUMENT");
  return openAiCompatibleAdapter;
};
