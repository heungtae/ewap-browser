import { fail, isPlainObject } from "../security/validation.js";
import { ProviderRegistry } from "./registry.js";

type Storage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};
const key = "provider_plugins";

export class ProviderPluginStore {
  public constructor(
    private readonly storage: Storage,
    private readonly registry: ProviderRegistry,
  ) {}

  public async load(): Promise<void> {
    const value = (await this.storage.get(key))[key];
    if (value === undefined || value === null) return;
    if (
      !isPlainObject(value) ||
      value.schema_version !== 1 ||
      typeof value.builtin_enabled !== "boolean" ||
      !Array.isArray(value.plugins) ||
      value.plugins.length > 32 ||
      Object.keys(value).some(
        (field) =>
          !["schema_version", "builtin_enabled", "plugins"].includes(field),
      )
    )
      return fail("PROVIDER_PLUGIN_INCOMPATIBLE");
    const plugins = value.plugins as unknown[];
    for (const item of plugins) {
      if (
        !isPlainObject(item) ||
        Object.keys(item).some(
          (field) => field !== "manifest" && field !== "enabled",
        ) ||
        typeof item.enabled !== "boolean"
      )
        return fail("PROVIDER_PLUGIN_INCOMPATIBLE");
      const installed = this.registry.install(item.manifest);
      if (!item.enabled)
        this.registry.setEnabled(installed.manifest.plugin_id, false);
    }
    this.registry.setEnabled(
      "contextpilot.openai-compatible",
      value.builtin_enabled as boolean,
    );
  }

  public async persist(): Promise<void> {
    const snapshot = this.registry.snapshot();
    const builtin = snapshot.find((item) => item.bundled);
    await this.storage.set({
      [key]: {
        schema_version: 1,
        builtin_enabled: builtin?.enabled === true,
        plugins: snapshot
          .filter((item) => !item.bundled)
          .map(({ manifest, enabled }) => ({ manifest, enabled })),
      },
    });
  }
}
