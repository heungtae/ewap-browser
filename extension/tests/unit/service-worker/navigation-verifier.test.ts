import { describe, expect, it } from "vitest";
import { waitForExactNavigation } from "../../../src/service-worker/navigation-verifier.js";

describe("exact navigation verifier", () => {
  it("accepts only the expected origin and path after navigation settles", async () => {
    const urls = [
      "http://127.0.0.1:8443/",
      "http://127.0.0.1:8443/trend-analysis.html",
    ];
    await expect(
      waitForExactNavigation(
        async () => {
          const url = urls.shift();
          return url === undefined ? {} : { url };
        },
        {
          origin: "http://127.0.0.1:8443",
          pathname: "/trend-analysis.html",
        },
        2,
        0,
      ),
    ).resolves.toBe(true);
  });

  it("rejects a matching path with a query, fragment, or different origin", async () => {
    for (const url of [
      "http://127.0.0.1:8443/trend-analysis.html?next=1",
      "http://127.0.0.1:8443/trend-analysis.html#chart",
      "https://example.test/trend-analysis.html",
    ])
      await expect(
        waitForExactNavigation(
          async () => ({ url }),
          {
            origin: "http://127.0.0.1:8443",
            pathname: "/trend-analysis.html",
          },
          1,
          0,
        ),
      ).resolves.toBe(false);
  });
});
