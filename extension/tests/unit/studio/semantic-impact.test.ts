import { describe, expect, it } from "vitest";
import { impactedRegressionIds } from "../../../src/studio/semantic-impact.js";
import { validateStudio } from "../../../src/studio/validation.js";

describe("Studio validation and impact selection", () => {
  it("selects_only_workflows_depending_on_a_changed_fingerprint", () =>
    expect(
      impactedRegressionIds(
        [
          {
            id: "a",
            profile_id: "yield",
            fingerprint: "old",
            workflow_ids: ["w2", "w1"],
          },
          {
            id: "b",
            profile_id: "other",
            fingerprint: "same",
            workflow_ids: ["w3"],
          },
        ],
        [
          {
            profile_id: "yield",
            before_fingerprint: "old",
            after_fingerprint: "new",
          },
          {
            profile_id: "other",
            before_fingerprint: "same",
            after_fingerprint: "same",
          },
        ],
      ),
    ).toEqual(["w1", "w2"]));
  it("reports_every_L0_to_L6_gate_without_turning_missing_evidence_into_pass", () => {
    const result = validateStudio({
      source_valid: true,
      signature_valid: true,
      fingerprint_match: true,
      workflow_targets_unique: true,
      policy_allowed: true,
      regression_selected: true,
      chrome_evidence: false,
    });
    expect(result).toHaveLength(7);
    expect(result.at(-1)).toEqual({ level: "L6", passed: false });
  });
});
