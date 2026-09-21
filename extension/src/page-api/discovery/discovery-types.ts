export const DISCOVERY_TERMINALS = [
  "COMPLETED",
  "CANCELLED",
  "STALE",
  "MAIN_UNRESPONSIVE",
  "POLICY_DENIED",
] as const;
export type DiscoveryTerminal = (typeof DISCOVERY_TERMINALS)[number];

export type DiscoveryCandidateKind =
  | "public_js_function_hint"
  | "script_endpoint_hint";
export type DiscoveryCandidate = {
  candidate_ref: string;
  kind: DiscoveryCandidateKind;
  label: string;
  confidence: "low" | "medium";
  evidence: readonly (
    | "OWN_DATA_DESCRIPTOR"
    | "FUNCTION_SHAPE"
    | "INLINE_SCRIPT_LITERAL_PATTERN"
  )[];
  limitations: readonly (
    | "UNTRUSTED_MAIN_WORLD"
    | "NO_EXECUTION"
    | "NO_EXTERNAL_SCRIPT"
    | "POSSIBLE_REFLECTION_TRAP"
  )[];
};

export type DiscoveryResult = {
  candidates: readonly DiscoveryCandidate[];
  truncated: boolean;
  terminal: DiscoveryTerminal;
  duration_ms: number;
};

export type MainDiscoveryHint = {
  kind: DiscoveryCandidateKind;
  confidence: "low" | "medium";
  evidence: readonly (
    | "OWN_DATA_DESCRIPTOR"
    | "FUNCTION_SHAPE"
    | "INLINE_SCRIPT_LITERAL_PATTERN"
  )[];
  limitations: readonly (
    | "UNTRUSTED_MAIN_WORLD"
    | "NO_EXECUTION"
    | "NO_EXTERNAL_SCRIPT"
    | "POSSIBLE_REFLECTION_TRAP"
  )[];
};

export type MainDiscoveryResult = {
  hints: readonly MainDiscoveryHint[];
  truncated: boolean;
};

export const isMainDiscoveryResult = (
  value: unknown,
): value is MainDiscoveryResult => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as { hints?: unknown; truncated?: unknown };
  if (!Array.isArray(record.hints) || typeof record.truncated !== "boolean")
    return false;
  return record.hints.every((hint) => {
    if (typeof hint !== "object" || hint === null) return false;
    const item = hint as Partial<MainDiscoveryHint>;
    const evidence = item.evidence;
    const limitations = item.limitations;
    return (
      (item.kind === "public_js_function_hint" ||
        item.kind === "script_endpoint_hint") &&
      (item.confidence === "low" || item.confidence === "medium") &&
      Array.isArray(evidence) &&
      evidence.every((value) =>
        [
          "OWN_DATA_DESCRIPTOR",
          "FUNCTION_SHAPE",
          "INLINE_SCRIPT_LITERAL_PATTERN",
        ].includes(value),
      ) &&
      Array.isArray(limitations) &&
      limitations.every((value) =>
        [
          "UNTRUSTED_MAIN_WORLD",
          "NO_EXECUTION",
          "NO_EXTERNAL_SCRIPT",
          "POSSIBLE_REFLECTION_TRAP",
        ].includes(value),
      )
    );
  });
};
