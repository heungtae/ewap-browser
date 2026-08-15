import { describe, expect, it } from "vitest";
import { decide } from "../../../src/policy/decision.js";
describe("policy decision", () => {
  it("given_ask_mutation_when_deciding_then_denied", () =>
    expect(
      decide({
        valid: true,
        originAllowed: true,
        mode: "ask",
        profile: "verified",
        mutation: true,
        risk: "R1",
      }),
    ).toMatchObject({ decision: "DENY", code: "POLICY_DENIED" }));
  it("given_r3_when_deciding_then_denied", () =>
    expect(
      decide({
        valid: true,
        originAllowed: true,
        mode: "act",
        profile: "verified",
        mutation: true,
        risk: "R3",
      }),
    ).toMatchObject({ decision: "DENY" }));
  it("given_r2_without_binding_when_deciding_then_denied", () =>
    expect(
      decide({
        valid: true,
        originAllowed: true,
        mode: "act",
        profile: "verified",
        mutation: true,
        risk: "R2",
        hostBinding: false,
      }),
    ).toMatchObject({ code: "CONFIRMATION_INVALID" }));
  it("given_r2_with_binding_when_deciding_then_confirmation_required", () =>
    expect(
      decide({
        valid: true,
        originAllowed: true,
        mode: "act",
        profile: "verified",
        mutation: true,
        risk: "R2",
        hostBinding: true,
      }),
    ).toMatchObject({ decision: "REQUIRE_CONFIRMATION" }));
});
