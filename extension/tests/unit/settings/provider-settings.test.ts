import { describe, expect, it } from "vitest";
import { ProviderSettings } from "../../../src/settings/provider-settings.js";
import type { ProviderConfig } from "../../../src/providers/types.js";

const provider: ProviderConfig = {
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
  label: "local",
  base_url: "http://127.0.0.1:8080/v1",
  wire_api: "responses",
  model: "qwen",
  api_key: "secret-key",
  api_key_header: "authorization_bearer",
  headers: [{ name: "X-Fixture", value: "secret-header" }],
  timeout_ms: 30_000,
  enabled: true,
};

describe("provider settings", () => {
  it("given_saved_secret_when_reading_or_exporting_then_values_are_redacted", async () => {
    let stored: unknown;
    const settings = new ProviderSettings({
      async read() {
        return stored;
      },
      async write(value) {
        stored = structuredClone(value);
      },
    });
    await settings.save("local", provider);
    const listed = await settings.list();
    const exported = await settings.exportPublic();
    expect(listed.local).toMatchObject({
      has_api_key: true,
      header_names: ["X-Fixture"],
    });
    expect(JSON.stringify(listed)).not.toContain("secret-key");
    expect(JSON.stringify(exported)).not.toContain("secret-header");
    expect((await settings.resolve("local")).api_key).toBe("secret-key");
  });

  it("given_remove_without_secret_deletion_then_provider_is_only_disabled", async () => {
    let stored: unknown;
    const settings = new ProviderSettings({
      async read() {
        return stored;
      },
      async write(value) {
        stored = structuredClone(value);
      },
    });
    await settings.save("local", provider);
    await settings.remove("local", false);
    expect(await settings.resolve("local")).toMatchObject({
      enabled: false,
      api_key: "secret-key",
    });
    await settings.remove("local", true);
    await expect(settings.resolve("local")).rejects.toThrow(
      "PROVIDER_NOT_CONFIGURED",
    );
  });
});
