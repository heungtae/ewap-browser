import { generateKeyPairSync, sign } from "node:crypto";
import { expect, it } from "vitest";
import {
  importSignedProfile,
  importWorkflow,
} from "../../../../../apps/agent-server/src/integrations/imports.js";
import { ProfileReplayStore } from "../../../../src/profile/profile-replay.js";
const context = {
  deploymentId: "dev",
  nonce: "nonce",
  pageContextDigest: "digest",
  fingerprint: "fp",
  origin: "https://fixture.test",
  path: "/",
};
function signed(version = 2) {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const header = Buffer.from(
    JSON.stringify({
      alg: "ES256",
      typ: "company-page-profile+jws",
      kid: "key",
    }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      schema_version: 1,
      resolution: "MATCHED",
      iss: "resolver",
      aud: "dev",
      resolver_request_nonce: "nonce",
      page_context_digest: "digest",
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60000).toISOString(),
      profile_id: "profile",
      profile_version: version,
      matcher: { origin: context.origin, path_prefix: "/" },
      fingerprint: { alg: "semantic-projection-fp-v1", value: "fp" },
    }),
  ).toString("base64url");
  const compact = `${header}.${payload}.${sign("sha256", Buffer.from(`${header}.${payload}`), { key: keys.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
  return {
    compact,
    keyRing: {
      key: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
    },
  };
}
it("S35 signed profile adapter retains original proof/claims and advisory authority", async () => {
  const input = signed(),
    replay = new ProfileReplayStore();
  expect(
    await importSignedProfile(input.compact, input.keyRing, context, replay),
  ).toMatchObject({
    protocol: "company-page-profile+jws",
    profile_jws: input.compact,
    executable: false,
  });
  await expect(
    importSignedProfile(
      input.compact,
      input.keyRing,
      { ...context, nonce: "foreign" },
      replay,
    ),
  ).rejects.toThrow("PROFILE_UNAVAILABLE");
});
it("S35 signature tampering, unknown signer and profile rollback retain original failures", async () => {
  const input = signed(),
    replay = new ProfileReplayStore();
  await importSignedProfile(input.compact, input.keyRing, context, replay);
  await expect(
    importSignedProfile(input.compact + "x", input.keyRing, context, replay),
  ).rejects.toThrow("PROFILE_UNAVAILABLE");
  await expect(
    importSignedProfile(input.compact, {}, context, replay),
  ).rejects.toThrow("PROFILE_UNAVAILABLE");
  const old = signed(1);
  await expect(
    importSignedProfile(old.compact, old.keyRing, context, replay),
  ).rejects.toThrow("PROFILE_UNAVAILABLE");
});
it("S35 workflow adapter rejects unsupported tools and preserves original step meaning", () => {
  const workflow = {
    schema_version: 1,
    id: "workflow",
    title: "Fixture",
    steps: [
      {
        id: "one",
        tool: "click_by_ref",
        target: { role: "button", name: "Apply" },
      },
    ],
  };
  expect(importWorkflow(workflow)).toMatchObject({
    protocol: "browser-workflow/v1",
    executable: false,
    workflow,
  });
  expect(() =>
    importWorkflow({
      ...workflow,
      steps: [{ ...workflow.steps[0], tool: "arbitrary_browser_script" }],
    }),
  ).toThrow();
});
