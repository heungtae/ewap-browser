import type {
  MutationTool,
  Risk,
  Role,
  VerifierPredicate,
} from "../contracts/types.js";

export type ProfileResolution = "MATCHED" | "UNKNOWN";
export type Profile = {
  schema_version: 1;
  resolution: ProfileResolution;
  iss: string;
  aud: string;
  resolver_request_nonce: string;
  page_context_digest: string;
  issued_at: string;
  expires_at: string;
  profile_id?: string;
  profile_version?: number;
  matcher?: { origin: string; path_prefix: string };
  fingerprint: { alg: "semantic-projection-fp-v1"; value: string };
  tools?: unknown[];
  workflow?: unknown;
  business_mcp?: unknown[];
  authoritative_fields?: unknown[];
};
export type ProfileContext = {
  deploymentId: string;
  nonce: string;
  pageContextDigest: string;
  origin: string;
  path: string;
  fingerprint: string;
  now?: Date;
};
export type ProfileActionTool = {
  tool: MutationTool;
  effect: "local-ui-only" | "server-side";
  risk: Extract<Risk, "R1" | "R2">;
  eligible_roles: readonly Role[];
  verifier: Extract<VerifierPredicate, { kind: "semantic-state-transition" }>;
  option_values?: readonly string[];
};
