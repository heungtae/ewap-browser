import { describe, expect, it } from "vitest";
import { parsePublicProviderImport } from "../../../src/settings/provider-public-import.js";

describe("public provider import", () => {
  it("imports only one closed public provider without secrets", () => {
    const exported = {
      schema_version: 1,
      providers: {
        local: {
          plugin_id: "fixture.local-provider",
          plugin_version: "1.0.0",
          label: "local",
          base_url: "http://localhost:11434/v1",
          wire_api: "chat_completions",
          model: "fixture",
          api_key_header: "none",
          header_names: [],
          has_api_key: false,
          timeout_ms: 1000,
          enabled: true,
        },
      },
    };
    expect(parsePublicProviderImport(exported).id).toBe("local");
    expect(() =>
      parsePublicProviderImport({
        ...exported,
        providers: {
          local: { ...exported.providers.local, api_key: "secret" },
        },
      }),
    ).toThrow();
  });
});
