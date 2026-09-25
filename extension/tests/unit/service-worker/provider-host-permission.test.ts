import { describe, expect, it, vi } from "vitest";
import { requireProviderHostPermission } from "../../../src/service-worker/provider-host-permission.js";
import type { BrowserChromeApi } from "../../../src/service-worker/browser-api.js";

const browser = (origins: string[]): BrowserChromeApi =>
  ({
    permissions: { getAll: vi.fn().mockResolvedValue({ origins }) },
  }) as unknown as BrowserChromeApi;

describe("HTTP Provider host permission", () => {
  const endpoint = new URL("http://localhost:11434/v1/models");

  it("requires the endpoint grant even when screenshot access covers all URLs", async () => {
    await expect(
      requireProviderHostPermission(browser(["<all_urls>"]), endpoint),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  });

  it("allows a separately granted endpoint", async () => {
    await expect(
      requireProviderHostPermission(
        browser(["<all_urls>", "http://localhost/*"]),
        endpoint,
      ),
    ).resolves.toBeUndefined();
  });
});
