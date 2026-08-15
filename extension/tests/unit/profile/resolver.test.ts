import { describe, expect, it } from "vitest";
import { ProfileResolver } from "../../../src/profile/resolver.js";
describe("profile resolver", () =>
  it("given_missing_operational_endpoint_when_resolving_then_fails_closed_without_fetch", async () => {
    let called = false;
    const resolver = new ProfileResolver(
      { deploymentId: "dev", allowedOrigins: [], keyRing: {} },
      async () => {
        called = true;
        return new Response();
      },
    );
    await expect(
      resolver.resolve({
        origin: "https://fixture.company.test",
        path: "/",
        pageContextDigest: "digest",
        fingerprint: "fp",
      }),
    ).rejects.toThrow("PROFILE_UNAVAILABLE");
    expect(called).toBe(false);
  }));

describe("profile resolver input", () =>
  it("given_malformed_endpoint_when_resolving_then_fails_closed_without_fetch", async () => {
    let called = false;
    const resolver = new ProfileResolver(
      {
        deploymentId: "dev",
        url: "not a URL",
        allowedOrigins: ["https://resolver.company.test"],
        keyRing: {},
      },
      async () => {
        called = true;
        return new Response();
      },
    );
    await expect(
      resolver.resolve({
        origin: "https://fixture.company.test",
        path: "/",
        pageContextDigest: "digest",
        fingerprint: "fp",
      }),
    ).rejects.toThrow("PROFILE_UNAVAILABLE");
    expect(called).toBe(false);
  }));
