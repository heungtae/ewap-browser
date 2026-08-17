import { describe, expect, it } from "vitest";
import { validatePluginManifest } from "../../../src/providers/manifest.js";
import { ProviderRegistry } from "../../../src/providers/registry.js";

describe("provider plugin registry", () => {
  it("given_builtin_plugin_when_resolving_then_adapter_is_available", () => {
    const registry = new ProviderRegistry();
    expect(
      registry.resolve("contextpilot.openai-compatible", "1.2.0").adapter.id,
    ).toBe("contextpilot.openai-compatible");
  });

  it("given_oauth_or_executable_field_when_importing_then_manifest_is_rejected", () => {
    const manifest = {
      schema_version: 1,
      plugin_id: "example.provider",
      plugin_version: "1.0.0",
      api_version: 1,
      label: "Example",
      adapter_id: "contextpilot.openai-compatible",
      wire_apis: ["responses"],
      auth_schemes: ["authorization_bearer"],
    };
    expect(() =>
      validatePluginManifest({ ...manifest, oauth: { scope: "all" } }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      validatePluginManifest({ ...manifest, entry: "https://evil/plugin.js" }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      validatePluginManifest({ ...manifest, auth_schemes: ["oauth_pkce"] }),
    ).toThrow("INVALID_ARGUMENT");
  });
});
