import { describe, expect, it } from "vitest";
import { mayApprovePlan } from "../../../src/service-worker/plan-approval-authority.js";

describe("plan approval authority", () => {
  const sessions = new Map([
    ["current-session", { origin: "https://fixture.example:8443" }],
  ]);

  it("accepts only the live session's exact origin in follow-plan mode", () => {
    expect(
      mayApprovePlan("follow_a_plan", sessions, "current-session", [
        "https://fixture.example:8443",
      ]),
    ).toBe(true);
    for (const origin of [
      "https://fixture.example",
      "https://sub.fixture.example:8443",
      "https://fixture.example.:8443",
      "https://other.example",
    ])
      expect(
        mayApprovePlan("follow_a_plan", sessions, "current-session", [origin]),
      ).toBe(false);
    expect(
      mayApprovePlan("follow_a_plan", sessions, "expired-session", [
        "https://fixture.example:8443",
      ]),
    ).toBe(false);
    expect(
      mayApprovePlan(
        "skip_all_permission_checks",
        sessions,
        "current-session",
        ["https://fixture.example:8443"],
      ),
    ).toBe(false);
  });
});
