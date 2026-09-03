import { describe, expect, it } from "vitest";
import { profileModelContext } from "../../../src/profile/profile-model-context.js";

describe("Profile model context", () => {
  it("accepts_bounded_business_context", () =>
    expect(
      profileModelContext({
        title: "Yield analysis",
        summary: "Review the current manufacturing trend.",
        facts: [{ label: "Unit", value: "Product and process node" }],
        glossary: [{ term: "Node", definition: "Manufacturing category" }],
        limitations: ["Month-end data is authoritative."],
      }).title,
    ).toBe("Yield analysis"));
  it("rejects_urls_that_could_be_instruction_or_navigation_data", () =>
    expect(() =>
      profileModelContext({
        title: "Yield analysis",
        summary: "See https://internal.example.",
        facts: [],
        glossary: [],
        limitations: [],
      }),
    ).toThrow("PROFILE_UNAVAILABLE"));
});
