import { describe, expect, it } from "vitest";
import {
  approvalCategories,
  defaultApprovalPolicy,
  migrateApprovalPolicy,
  resolveApproval,
  validateApprovalPolicy,
} from "../../../src/policy/approval-policy.js";
import {
  defaultAgentPreferences,
  gatePermission,
  validateAgentPreferences,
} from "../../../src/policy/permission-mode.js";
import { PermissionManager } from "../../../src/policy/permission-manager.js";

describe("unified approval policy", () => {
  it.each(approvalCategories)(
    "resolves all three decisions for %s",
    (category) => {
      const policy = defaultApprovalPolicy();
      policy.mode = "custom";
      for (const decision of ["ask", "auto", "deny"] as const) {
        policy.categories[category] = decision;
        expect(resolveApproval(validateApprovalPolicy(policy), category)).toBe(
          decision,
        );
      }
      policy.mode = "full";
      expect(resolveApproval(validateApprovalPolicy(policy), category)).toBe(
        "auto",
      );
      policy.mode = "ask";
      expect(resolveApproval(validateApprovalPolicy(policy), category)).toBe(
        "ask",
      );
    },
  );
  it.each(["standard", "skip_all_permission_checks", "follow_a_plan"])(
    "migrates %s without new disclosure or mutation authority",
    (mode) => {
      const policy = migrateApprovalPolicy(mode);
      expect(
        approvalCategories.filter((c) => resolveApproval(policy, c) === "auto"),
      ).toEqual(mode === "standard" ? [] : ["tool_permission"]);
      expect(policy.tool_scope).toBe(
        mode === "follow_a_plan" ? "approved_plan" : "request",
      );
      expect(
        validateAgentPreferences({
          ...defaultAgentPreferences(),
          permission_mode: mode,
        }).approval_policy,
      ).toEqual(policy);
    },
  );
  it("rejects unknown versions, missing categories, extra keys and malformed revisions", () => {
    const policy = defaultApprovalPolicy();
    for (const value of [
      { ...policy, version: 2 },
      { ...policy, categories: {} },
      { ...policy, injected: true },
      { ...policy, revision: -1 },
      { ...policy, mode: "AUTO" },
    ])
      expect(() => validateApprovalPolicy(value)).toThrow("INVALID_ARGUMENT");
    expect(() => resolveApproval(policy, "injected" as never)).toThrow(
      "INVALID_ARGUMENT",
    );
  });
  it("preserves stored DENY and custom deny above an existing grant", () => {
    const manager = new PermissionManager();
    const preferences = {
      ...defaultAgentPreferences(),
      approval_policy: defaultApprovalPolicy(),
    };
    preferences.approval_policy.mode = "full";
    manager.decide("click", "https://fixture.test", "run", "deny");
    expect(
      gatePermission(
        manager,
        preferences,
        "click",
        "https://fixture.test",
        "run",
      ),
    ).toBe("DENY");
    manager.decide("type", "https://fixture.test", "run", "once");
    preferences.approval_policy.mode = "custom";
    preferences.approval_policy.categories.tool_permission = "deny";
    expect(
      gatePermission(
        manager,
        preferences,
        "type",
        "https://fixture.test",
        "run",
      ),
    ).toBe("DENY");
  });
  it("keeps approved-plan exact-origin scope", () => {
    const preferences = {
      ...defaultAgentPreferences(),
      approval_policy: migrateApprovalPolicy("follow_a_plan"),
    };
    expect(
      gatePermission(
        new PermissionManager(),
        preferences,
        "click",
        "https://fixture.test",
        "run",
        new Set(["https://fixture.test"]),
      ),
    ).toBe("ALLOW");
    expect(
      gatePermission(
        new PermissionManager(),
        preferences,
        "click",
        "https://other.test",
        "run",
        new Set(["https://fixture.test"]),
      ),
    ).toBe("PLAN_SCOPE_VIOLATION");
  });
});
