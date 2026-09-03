import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ProfileResolver } from "../../../src/profile/resolver.js";
import { ProfileReplayStore } from "../../../src/profile/profile-replay.js";

const encoded = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const signed = (
  payload: Record<string, unknown>,
  privateKey: string,
): string => {
  const header = encoded({
    alg: "ES256",
    typ: "company-page-profile+jws",
    kid: "k1",
  });
  const body = encoded(payload);
  return `${header}.${body}.${sign("sha256", Buffer.from(`${header}.${body}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url")}`;
};
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

describe("profile resolver replay protection", () =>
  it("given_same_profile_version_with_changed_claims_when_resolving_then_fails_closed", async () => {
    const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const publicKey = keys.publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    let changed = false;
    const resolver = new ProfileResolver(
      {
        deploymentId: "dev",
        url: "https://resolver.company.test/v1/resolve",
        allowedOrigins: ["https://resolver.company.test"],
        keyRing: { k1: publicKey },
      },
      async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as {
          resolver_request_nonce: string;
          page: { page_context_digest: string; fingerprint: string };
        };
        const issued = new Date();
        const expires = new Date(issued.valueOf() + 60_000);
        return new Response(
          signed(
            {
              schema_version: 1,
              resolution: "MATCHED",
              iss: "resolver",
              aud: "dev",
              resolver_request_nonce: request.resolver_request_nonce,
              page_context_digest: request.page.page_context_digest,
              issued_at: issued.toISOString(),
              expires_at: expires.toISOString(),
              profile_id: "manufacturing",
              profile_version: 1,
              matcher: {
                origin: "https://fixture.company.test",
                path_prefix: "/",
              },
              fingerprint: {
                alg: "semantic-projection-fp-v1",
                value: request.page.fingerprint,
              },
              tools: changed
                ? [
                    {
                      tool: "click_by_ref",
                      effect: "local-ui-only",
                      risk: "R1",
                      eligible_roles: ["button"],
                      verifier: {
                        kind: "semantic-state-transition",
                        declaration_id: "changed",
                        pre_state_digest: "digest",
                        required_changes: [],
                      },
                    },
                  ]
                : [],
              business_mcp: [],
              authoritative_fields: [],
            },
            keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
          ),
          { headers: { "content-type": "application/jose" } },
        );
      },
      new ProfileReplayStore(),
    );
    const input = {
      origin: "https://fixture.company.test",
      path: "/case",
      pageContextDigest: "digest",
      fingerprint: "fp",
    };
    await expect(resolver.resolve(input)).resolves.toMatchObject({
      profile_id: "manufacturing",
    });
    changed = true;
    await expect(resolver.resolve(input)).rejects.toThrow(
      "PROFILE_UNAVAILABLE",
    );
  }));
