import { describe, expect, it } from "vitest";
import { createPageContextRuntime } from "../../../src/service-worker/page-context-runtime.js";
import { digestCanonical } from "../../../src/security/canonical.js";

const url = "https://fixture.test/approved?mode=1#result";
const setup = (change: "none" | "url" | "registration") => {
  let registered = true;
  return createPageContextRuntime({
    chrome: {
      tabs: {
        query: async () => [{ id: 7, url }],
        get: async () => {
          if (change === "registration") registered = false;
          return {
            id: 7,
            url: change === "url" ? "https://fixture.test/wrong" : url,
          };
        },
        sendMessage: async () => ({
          ok: true,
          snapshot: {
            origin: "https://fixture.test",
            snapshot: {
              document_epoch: "epoch-abcdefghijklmnop",
              frame_id: 0,
              nodes: [],
              visible_text: "Destination",
            },
          },
        }),
      },
    } as never,
    defaultScope: () => "all_dom",
    isRegistered: () => registered,
    pageOrigin: (value) => new URL(value!).origin,
    recovery: { recover: async () => true } as never,
    scopeFor: () => "scope-abcdefghijklmnop",
  });
};
describe("ISS-20261011-004 browser observation destination binding", () => {
  it("uses the normalized full browser URL and preserves it for diagnostics", async () => {
    const active = await setup("none").read();
    expect(active.navigationUrlDigest).toBe(digestCanonical(new URL(url).href));
    expect(active.path).toBe("/approved");
    expect(active.url).toBe(url);
  });
  it.each(["url", "registration"] as const)(
    "rejects a %s change while reading the snapshot",
    async (change) => {
      await expect(setup(change).read()).rejects.toMatchObject({
        code: "PAGE_SCOPE_STALE",
      });
    },
  );
});
