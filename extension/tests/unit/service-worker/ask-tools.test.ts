import { describe, expect, it } from "vitest";
import { redactedTabTitle } from "../../../src/service-worker/ask-tools.js";

describe("Ask tab title", () => {
  it("removes control characters and bounds the Provider title", () => {
    expect(redactedTabTitle("  Report\u0000\n  name  ")).toBe("Report name");
    expect(redactedTabTitle("x".repeat(200))).toHaveLength(160);
  });
});
