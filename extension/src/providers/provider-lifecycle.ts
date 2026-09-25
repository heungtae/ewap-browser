import { fail, isPlainObject } from "../security/validation.js";
import type { ProviderSettings } from "../settings/provider-settings.js";
import type { ProviderPluginStore } from "./plugin-store.js";
import type { ProviderRegistry } from "./registry.js";

export const lifecycleKinds = new Set([
  "PLUGIN_INSTALL",
  "PLUGIN_SET_ENABLED",
  "PLUGIN_REMOVE",
  "PROVIDER_SET_ACTIVE",
  "PROVIDER_REMOVE",
]);

export const handleProviderLifecycle = async (
  kind: string,
  payload: unknown,
  registry: ProviderRegistry,
  pluginStore: ProviderPluginStore,
  settings: ProviderSettings,
): Promise<Record<string, unknown>> => {
  if (kind === "PLUGIN_INSTALL") {
    const plugin = registry.install(payload);
    await pluginStore.persist();
    return { ok: true, plugin };
  }
  const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
  if (kind === "PLUGIN_SET_ENABLED") {
    if (
      typeof value.plugin_id !== "string" ||
      typeof value.enabled !== "boolean" ||
      Object.keys(value).some((key) => key !== "plugin_id" && key !== "enabled")
    )
      return fail("INVALID_ARGUMENT");
    registry.setEnabled(value.plugin_id, value.enabled);
    await pluginStore.persist();
    await settings.setEnabledByPlugin(value.plugin_id, value.enabled);
    return { ok: true };
  }
  if (kind === "PLUGIN_REMOVE") {
    if (
      typeof value.plugin_id !== "string" ||
      typeof value.delete_linked_secrets !== "boolean" ||
      Object.keys(value).some(
        (key) => key !== "plugin_id" && key !== "delete_linked_secrets",
      )
    )
      return fail("INVALID_ARGUMENT");
    registry.remove(value.plugin_id);
    await pluginStore.persist();
    await settings.removeByPlugin(value.plugin_id, value.delete_linked_secrets);
    return { ok: true, providers: await settings.list() };
  }
  if (kind === "PROVIDER_SET_ACTIVE") {
    if (typeof value.id !== "string" || Object.keys(value).length !== 1)
      return fail("INVALID_ARGUMENT");
    await settings.setActive(value.id);
    return { ok: true };
  }
  if (kind === "PROVIDER_REMOVE") {
    if (
      typeof value.id !== "string" ||
      typeof value.delete_secret !== "boolean" ||
      Object.keys(value).some((key) => key !== "id" && key !== "delete_secret")
    )
      return fail("INVALID_ARGUMENT");
    await settings.remove(value.id, value.delete_secret);
    return { ok: true, providers: await settings.list() };
  }
  return fail("INVALID_ARGUMENT");
};
