import { fail } from "../security/validation.js";
import { validatePluginManifest } from "./manifest.js";
import { openAiCompatibleAdapter } from "./openai-compatible.js";
import type { ProviderAdapter, ProviderPluginManifest } from "./types.js";

export const BUILTIN_OPENAI_COMPATIBLE: ProviderPluginManifest = {
  schema_version: 1,
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
  api_version: 1,
  label: "OpenAI-compatible",
  adapter_id: "contextpilot.openai-compatible",
  wire_apis: ["chat_completions", "responses"],
  auth_schemes: ["none", "authorization_bearer", "api-key", "x-goog-api-key"],
};
const LEGACY_OPENAI_COMPATIBLE_PLUGIN = "webbrain.openai-compatible";
export type InstalledPlugin = {
  manifest: ProviderPluginManifest;
  enabled: boolean;
  bundled: boolean;
};

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>([
    [openAiCompatibleAdapter.id, openAiCompatibleAdapter],
  ]);
  private readonly plugins = new Map<string, InstalledPlugin>();

  public constructor() {
    this.install(BUILTIN_OPENAI_COMPATIBLE, true);
  }

  public install(value: unknown, bundled = false): InstalledPlugin {
    const manifest = validatePluginManifest(value);
    if (!this.adapters.has(manifest.adapter_id))
      return fail("PROVIDER_PLUGIN_NOT_FOUND");
    const current = this.plugins.get(manifest.plugin_id);
    if (
      current &&
      Number(current.manifest.plugin_version.split(".")[0]) !==
        Number(manifest.plugin_version.split(".")[0])
    )
      return fail("PROVIDER_PLUGIN_INCOMPATIBLE");
    const installed = { manifest, enabled: true, bundled };
    this.plugins.set(manifest.plugin_id, installed);
    return installed;
  }

  public setEnabled(pluginId: string, enabled: boolean): void {
    const plugin =
      this.plugins.get(pluginId) ?? fail("PROVIDER_PLUGIN_NOT_FOUND");
    plugin.enabled = enabled;
  }

  public remove(pluginId: string): void {
    const plugin =
      this.plugins.get(pluginId) ?? fail("PROVIDER_PLUGIN_NOT_FOUND");
    if (plugin.bundled) fail("POLICY_DENIED");
    this.plugins.delete(pluginId);
  }

  public resolve(
    pluginId: string,
    version: string,
  ): { manifest: ProviderPluginManifest; adapter: ProviderAdapter } {
    const resolvedPluginId =
      pluginId === LEGACY_OPENAI_COMPATIBLE_PLUGIN
        ? BUILTIN_OPENAI_COMPATIBLE.plugin_id
        : pluginId;
    const plugin =
      this.plugins.get(resolvedPluginId) ?? fail("PROVIDER_PLUGIN_NOT_FOUND");
    if (!plugin.enabled) fail("PROVIDER_PLUGIN_NOT_FOUND");
    if (
      Number(plugin.manifest.plugin_version.split(".")[0]) !==
      Number(version.split(".")[0])
    )
      fail("PROVIDER_PLUGIN_INCOMPATIBLE");
    const adapter =
      this.adapters.get(plugin.manifest.adapter_id) ??
      fail("PROVIDER_PLUGIN_NOT_FOUND");
    return { manifest: plugin.manifest, adapter };
  }

  public snapshot(): readonly InstalledPlugin[] {
    return [...this.plugins.values()].map((plugin) => ({
      manifest: { ...plugin.manifest },
      enabled: plugin.enabled,
      bundled: plugin.bundled,
    }));
  }
}
