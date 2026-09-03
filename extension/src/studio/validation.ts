export type StudioValidationLevel =
  | "L0"
  | "L1"
  | "L2"
  | "L3"
  | "L4"
  | "L5"
  | "L6";
export type StudioValidationInput = {
  source_valid: boolean;
  signature_valid: boolean;
  fingerprint_match: boolean;
  workflow_targets_unique: boolean;
  policy_allowed: boolean;
  regression_selected: boolean;
  chrome_evidence: boolean;
};
export type StudioValidationResult = {
  level: StudioValidationLevel;
  passed: boolean;
};

const checks: Array<[StudioValidationLevel, keyof StudioValidationInput]> = [
  ["L0", "source_valid"],
  ["L1", "signature_valid"],
  ["L2", "fingerprint_match"],
  ["L3", "workflow_targets_unique"],
  ["L4", "policy_allowed"],
  ["L5", "regression_selected"],
  ["L6", "chrome_evidence"],
];

export const validateStudio = (
  input: StudioValidationInput,
): StudioValidationResult[] =>
  checks.map(([level, key]) => ({ level, passed: input[key] }));
