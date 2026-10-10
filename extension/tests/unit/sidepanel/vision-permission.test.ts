import { describe, expect, it, vi } from "vitest";
import { requestVisionPermission } from "../../../src/sidepanel/vision-permission.js";
describe("S19 vision Chrome permission", () => {
  it("reuses an existing grant and requests an absent grant only after the approval click", async () => {
    const request = vi.fn(async () => true);
    expect(
      await requestVisionPermission({ contains: async () => true, request }),
    ).toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(
      await requestVisionPermission({ contains: async () => false, request }),
    ).toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ["<all_urls>"] });
  });
  it("resolves native denial/error as denial rather than leaving source consent pending", async () => {
    expect(
      await requestVisionPermission({
        contains: async () => false,
        request: async () => false,
      }),
    ).toBe(false);
    expect(
      await requestVisionPermission({
        contains: async () => false,
        request: async () => {
          throw Error("gesture missing");
        },
      }),
    ).toBe(false);
    expect(await requestVisionPermission()).toBe(false);
  });
});
