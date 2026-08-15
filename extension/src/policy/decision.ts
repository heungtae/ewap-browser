import type { Decision, ErrorCode, Mode, Risk } from "../contracts/types.js";
export type PolicyInput = {
  valid: boolean;
  originAllowed: boolean;
  mode: Mode;
  profile: "verified" | "unknown" | "unavailable";
  mutation: boolean;
  sensitive?: boolean;
  stale?: boolean;
  actionable?: boolean;
  valueValid?: boolean;
  verifierValid?: boolean;
  risk: Risk;
  duplicate?: boolean;
  hostBinding?: boolean;
};
export type PolicyResult = { decision: Decision; code?: ErrorCode };
export const decide = (input: PolicyInput): PolicyResult => {
  if (!input.valid) return { decision: "DENY", code: "INVALID_ARGUMENT" };
  if (!input.originAllowed)
    return { decision: "DENY", code: "ORIGIN_NOT_ALLOWED" };
  if (input.mutation && input.mode === "ask")
    return { decision: "DENY", code: "POLICY_DENIED" };
  if (input.profile === "unavailable")
    return { decision: "DENY", code: "PROFILE_UNAVAILABLE" };
  if (input.profile === "unknown")
    return input.mutation
      ? { decision: "DENY", code: "UNKNOWN_PROFILE" }
      : { decision: "ALLOW" };
  if (input.sensitive || input.stale || input.actionable === false)
    return {
      decision: "DENY",
      code: input.stale ? "TARGET_STALE" : "TARGET_NOT_ACTIONABLE",
    };
  if (input.valueValid === false)
    return { decision: "DENY", code: "VALUE_BINDING_INVALID" };
  if (input.verifierValid === false)
    return { decision: "DENY", code: "TARGET_NOT_ACTIONABLE" };
  if (input.risk === "R3" || input.duplicate)
    return { decision: "DENY", code: "POLICY_DENIED" };
  if (input.risk === "R2" && !input.hostBinding)
    return { decision: "DENY", code: "CONFIRMATION_INVALID" };
  return input.risk === "R2"
    ? { decision: "REQUIRE_CONFIRMATION" }
    : { decision: "ALLOW" };
};
