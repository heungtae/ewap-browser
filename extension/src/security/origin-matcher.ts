import { fail } from "./validation.js";

export type PolicyBundle = {
  permission_origins: string[];
  page_read_origins: string[];
  profile_resolver_origins: string[];
  llm_egress_origins: string[];
};
const canonicalOrigin = (value: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail("ORIGIN_NOT_ALLOWED");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    return fail("ORIGIN_NOT_ALLOWED");
  if (
    parsed.hostname === "localhost" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname) ||
    parsed.hostname.includes(":")
  )
    return fail("ORIGIN_NOT_ALLOWED");
  return parsed.origin;
};
export const exactOrigin = (
  candidate: string,
  allowed: readonly string[],
): boolean => {
  try {
    return allowed.map(canonicalOrigin).includes(canonicalOrigin(candidate));
  } catch {
    return false;
  }
};
export const validatePolicyBundle = (bundle: PolicyBundle): PolicyBundle => {
  const permissions = new Set(bundle.permission_origins.map(canonicalOrigin));
  for (const list of [
    bundle.page_read_origins,
    bundle.profile_resolver_origins,
    bundle.llm_egress_origins,
  ])
    for (const origin of list)
      if (!permissions.has(canonicalOrigin(origin))) fail("ORIGIN_NOT_ALLOWED");
  return bundle;
};
