import { opaqueId } from "../security/canonical.js";
import { exactOrigin } from "../security/origin-matcher.js";
import { fail } from "../security/validation.js";
import { verifyProfileJws } from "./jws.js";
import { verifyProfileClaims, type Profile } from "./profile.js";
export type ResolverConfig = {
  deploymentId: string;
  url?: string;
  allowedOrigins: string[];
  keyRing: Record<string, string>;
};
export type ResolveInput = {
  origin: string;
  path: string;
  pageContextDigest: string;
  fingerprint: string;
};
export type ResolvedProfile = {
  profile: Profile;
  profile_jws: string;
};
export class ProfileResolver {
  public constructor(
    private readonly config: ResolverConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  public async resolve(input: ResolveInput): Promise<Profile> {
    return (await this.resolveWithProof(input)).profile;
  }
  public async resolveWithProof(input: ResolveInput): Promise<ResolvedProfile> {
    if (
      !input.path.startsWith("/") ||
      input.path.includes("?") ||
      input.path.includes("#")
    )
      return fail("PROFILE_UNAVAILABLE");
    let endpoint: URL;
    try {
      if (!this.config.url) return fail("PROFILE_UNAVAILABLE");
      endpoint = new URL(this.config.url);
    } catch {
      return fail("PROFILE_UNAVAILABLE");
    }
    if (!exactOrigin(endpoint.origin, this.config.allowedOrigins))
      return fail("PROFILE_UNAVAILABLE");
    if (endpoint.protocol !== "https:") return fail("PROFILE_UNAVAILABLE");
    const nonce = opaqueId();
    let response: Response;
    try {
      response = await this.fetcher(endpoint, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: 1,
          request_id: crypto.randomUUID(),
          resolver_request_nonce: nonce,
          deployment_id: this.config.deploymentId,
          page: {
            origin: input.origin,
            path: input.path,
            page_context_digest: input.pageContextDigest,
            fingerprint_alg: "semantic-projection-fp-v1",
            fingerprint: input.fingerprint,
          },
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return fail("PROFILE_UNAVAILABLE");
    }
    if (
      !response.ok ||
      response.headers.get("content-type") !== "application/jose"
    )
      return fail("PROFILE_UNAVAILABLE");
    const profile_jws = await response.text();
    const profile = await verifyProfileJws(profile_jws, this.config.keyRing);
    return {
      profile: verifyProfileClaims(profile, {
      deploymentId: this.config.deploymentId,
      nonce,
      pageContextDigest: input.pageContextDigest,
      origin: input.origin,
      path: input.path,
      fingerprint: input.fingerprint,
      }),
      profile_jws,
    };
  }
}
