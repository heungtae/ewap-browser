import { describe, expect, it } from "vitest";
import { PlanScopeStore } from "../../../src/policy/plan-scope.js";

describe("plan scope", () => {
  it("binds a plan to exact normalized origins for one run", () => {
    const plans = new PlanScopeStore();
    expect(plans.approve("run-1", ["https://Fixture.Company.Test/a"])).toEqual({
      run_id: "run-1",
      origins: ["https://fixture.company.test"],
    });
    expect(plans.origins("run-1").has("https://fixture.company.test")).toBe(
      true,
    );
    expect(plans.origins("other").size).toBe(0);
  });
  it("does not expand an approved host across ports", () => {
    const plans = new PlanScopeStore();
    plans.approve("run-1", ["https://fixture.company.test:8443/a"]);
    expect(plans.origins("run-1").has("https://fixture.company.test")).toBe(
      false,
    );
    expect(
      plans.origins("run-1").has("https://fixture.company.test:8443"),
    ).toBe(true);
  });
  it("rejects wildcard and restricted plan origins", () => {
    const plans = new PlanScopeStore();
    expect(() => plans.approve("run-1", ["https://*.company.test"])).toThrow(
      "ORIGIN_NOT_ALLOWED",
    );
    expect(() => plans.approve("run-1", ["chrome://settings"])).toThrow(
      "ORIGIN_NOT_ALLOWED",
    );
  });
});
