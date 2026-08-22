import { describe, expect, it } from "vitest";
import { PermissionManager } from "../../../src/policy/permission-manager.js";
import {
  defaultAgentPreferences,
  gatePermission,
  validateAgentPreferences,
} from "../../../src/policy/permission-mode.js";

describe("permission modes", () => {
  it("skip mode omits only the prompt and preserves explicit deny", () => {
    const manager = new PermissionManager();
    const preferences = {
      ...defaultAgentPreferences(),
      permission_mode: "skip_all_permission_checks" as const,
    };
    expect(
      gatePermission(
        manager,
        preferences,
        "click",
        "https://fixture.company.test",
        "run",
      ),
    ).toBe("ALLOW");
    manager.decide("click", "https://fixture.company.test", "other", "deny");
    expect(
      gatePermission(
        manager,
        preferences,
        "click",
        "https://fixture.company.test",
        "run",
      ),
    ).toBe("DENY");
  });
  it("plan mode denies hosts outside the exact approved set", () => {
    const manager = new PermissionManager();
    const preferences = {
      ...defaultAgentPreferences(),
      permission_mode: "follow_a_plan" as const,
    };
    expect(
      gatePermission(
        manager,
        preferences,
        "navigate",
        "https://other.company.test",
        "run",
        new Set(["fixture.company.test"]),
      ),
    ).toBe("PLAN_SCOPE_VIOLATION");
  });
  it("rejects partial or model-shaped preference records", () => {
    expect(() =>
      validateAgentPreferences({
        permission_mode: "skip_all_permission_checks",
      }),
    ).toThrow("INVALID_ARGUMENT");
  });
});
