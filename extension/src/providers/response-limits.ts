import { fail } from "../security/validation.js";

export const maxProviderBodyChars = 2 * 1024 * 1024;
export const maxProviderAssistantChars = 16_000;

export const providerResponseTooLarge = (): never =>
  fail("PROVIDER_UNAVAILABLE", "provider response exceeded the safe limit");
