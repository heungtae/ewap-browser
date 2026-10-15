import { fail, isPlainObject } from "../security/validation.js";
import type { ProviderSettings } from "../settings/provider-settings.js";

export const lifecycleKinds = new Set([
  "PROVIDER_SET_ACTIVE",
  "PROVIDER_REMOVE",
]);

export const handleProviderLifecycle = async (
  kind: string,
  payload: unknown,
  settings: ProviderSettings,
): Promise<Record<string, unknown>> => {
  const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
  if (value.revision !== undefined && !Number.isSafeInteger(value.revision))
    return fail("INVALID_ARGUMENT");
  if (kind === "PROVIDER_SET_ACTIVE") {
    if (
      typeof value.id !== "string" ||
      Object.keys(value).some((k) => !["id", "revision"].includes(k))
    )
      return fail("INVALID_ARGUMENT");
    await settings.setActive(value.id, value.revision as number | undefined);
    return { ok: true };
  }
  if (kind === "PROVIDER_REMOVE") {
    if (
      typeof value.id !== "string" ||
      typeof value.delete_secret !== "boolean" ||
      Object.keys(value).some(
        (key) => key !== "id" && key !== "delete_secret" && key !== "revision",
      )
    )
      return fail("INVALID_ARGUMENT");
    await settings.remove(
      value.id,
      value.delete_secret,
      value.revision as number | undefined,
    );
    return { ok: true, providers: await settings.list() };
  }
  return fail("INVALID_ARGUMENT");
};
