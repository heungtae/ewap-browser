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
  it("allows the local development demo origin", () => {
    const plans = new PlanScopeStore();
    expect(plans.approve("demo-run", ["http://localhost:3000/"])).toEqual({
      run_id: "demo-run",
      origins: ["http://localhost:3000"],
    });
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
  it("keeps subdomain, port, IDN and trailing-dot origins separate", () => {
    const plans = new PlanScopeStore();
    plans.approve("run-1", ["https://bücher.example/"]);
    const approved = plans.origins("run-1");
    expect(approved.has("https://xn--bcher-kva.example")).toBe(true);
    expect(approved.has("https://xn--bcher-kva.example.")).toBe(false);
    expect(approved.has("https://sub.xn--bcher-kva.example")).toBe(false);
    expect(approved.has("https://xn--bcher-kva.example:8443")).toBe(false);
    expect(() =>
      plans.approve("run-1", ["https://user@bücher.example/"]),
    ).toThrow("ORIGIN_NOT_ALLOWED");
    expect(approved.has("https://xn--bcher-kva.example")).toBe(true);
    plans.clearAll();
    expect(plans.origins("run-1").size).toBe(0);
  });
});
