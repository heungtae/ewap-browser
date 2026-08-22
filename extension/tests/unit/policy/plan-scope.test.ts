import { describe, expect, it } from "vitest";
import { PlanScopeStore } from "../../../src/policy/plan-scope.js";

describe("plan scope", () => {
  it("binds a plan to exact normalized hosts for one run", () => {
    const plans = new PlanScopeStore();
    expect(plans.approve("run-1", ["https://Fixture.Company.Test/a"])).toEqual({
      run_id: "run-1",
      hosts: ["fixture.company.test"],
    });
    expect(plans.hosts("run-1").has("fixture.company.test")).toBe(true);
    expect(plans.hosts("other").size).toBe(0);
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
