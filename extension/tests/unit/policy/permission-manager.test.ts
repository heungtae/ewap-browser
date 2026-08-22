import { describe, expect, it } from "vitest";
import { PermissionManager } from "../../../src/policy/permission-manager.js";

describe("permission manager", () => {
  it("given_once_permission_when_run_ends_then_grant_is_revoked", () => {
    const manager = new PermissionManager();
    expect(manager.check("type", "https://fixture.company.test/a", "run")).toBe(
      "REQUIRE_PERMISSION",
    );
    manager.decide("type", "https://fixture.company.test/a", "run", "once");
    expect(manager.check("type", "https://fixture.company.test/b", "run")).toBe(
      "ALLOW",
    );
    manager.endRun("run");
    expect(manager.check("type", "https://fixture.company.test/a", "run")).toBe(
      "REQUIRE_PERMISSION",
    );
  });

  it("given_persistent_deny_when_checked_then_it_wins_for_exact_host", () => {
    const manager = new PermissionManager();
    manager.decide("click", "https://fixture.company.test", "run", "deny");
    expect(
      manager.check("click", "https://fixture.company.test/x", "other"),
    ).toBe("DENY");
    expect(manager.check("click", "https://other.company.test", "other")).toBe(
      "REQUIRE_PERMISSION",
    );
  });

  it("given_restricted_origin_when_deciding_then_denied_before_grant", () => {
    const manager = new PermissionManager();
    expect(() =>
      manager.decide("click", "http://127.0.0.1", "run", "always"),
    ).toThrow("ORIGIN_NOT_ALLOWED");
    expect(() =>
      manager.decide("click", "chrome://settings", "run", "always"),
    ).toThrow("ORIGIN_NOT_ALLOWED");
  });

  it("given_local_demo_origin_when_granted_once_then_allows_only_the_run", () => {
    const manager = new PermissionManager();
    expect(manager.check("click", "http://127.0.0.1:8443", "demo-run")).toBe(
      "REQUIRE_PERMISSION",
    );
    manager.decide("click", "http://127.0.0.1:8443", "demo-run", "once");
    expect(manager.check("click", "http://127.0.0.1:8443", "demo-run")).toBe(
      "ALLOW",
    );
  });
});
