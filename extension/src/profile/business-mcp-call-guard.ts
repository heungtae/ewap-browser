import { fail } from "../security/validation.js";

export type BusinessMcpPageProof = {
  tabId: number;
  origin: string;
  documentEpoch: string;
  pageScopeEpoch: string;
  pageDigest: string;
};

/** Recheck the page proof before dispatching a Profile-bound HTTP call. */
export const assertFreshBusinessMcpCall = (
  expected: BusinessMcpPageProof,
  current: BusinessMcpPageProof | undefined,
  expiresAt: string,
  now = Date.now(),
): void => {
  if (
    !current ||
    current.tabId !== expected.tabId ||
    current.origin !== expected.origin ||
    current.documentEpoch !== expected.documentEpoch ||
    current.pageScopeEpoch !== expected.pageScopeEpoch ||
    current.pageDigest !== expected.pageDigest
  )
    return fail("PAGE_SCOPE_STALE");
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= now)
    return fail("PROFILE_UNAVAILABLE");
};
