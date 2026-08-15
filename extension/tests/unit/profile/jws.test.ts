import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyProfileJws } from "../../../src/profile/jws.js";
const encoded = (value: string) => Buffer.from(value).toString("base64url");
const signedProfile = () => {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const header = encoded(
    JSON.stringify({
      alg: "ES256",
      typ: "company-page-profile+jws",
      kid: "k1",
    }),
  );
  const payload = encoded(
    JSON.stringify({
      schema_version: 1,
      resolution: "UNKNOWN",
      iss: "resolver",
      aud: "dev",
      resolver_request_nonce: "nonce",
      page_context_digest: "digest",
      issued_at: "2026-08-15T00:00:00Z",
      expires_at: "2026-08-15T00:01:00Z",
      fingerprint: { alg: "semantic-projection-fp-v1", value: "fp" },
    }),
  );
  return {
    compact: `${header}.${payload}.${sign("sha256", Buffer.from(`${header}.${payload}`), { key: keys.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`,
    pem: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
};
describe("profile JWS", () => {
  it("given_es256_profile_when_signature_matches_then_payload_is_accepted", async () => {
    const { compact, pem } = signedProfile();
    expect((await verifyProfileJws(compact, { k1: pem })).resolution).toBe(
      "UNKNOWN",
    );
  });
  it("given_tampered_profile_when_verifying_then_denied", async () => {
    const { compact, pem } = signedProfile();
    await expect(verifyProfileJws(`${compact}x`, { k1: pem })).rejects.toThrow(
      "PROFILE_UNAVAILABLE",
    );
  });
});
