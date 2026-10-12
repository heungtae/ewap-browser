import { describe, expect, it } from "vitest";
import { preparePageMethodReturnData } from "../../../src/service-worker/page-method-return-data.js";

describe("page method return disclosure", () => {
  it("masks nested JSON credentials before encoding while preserving useful values", () => {
    const result = preparePageMethodReturnData({
      available: true,
      kind: "json",
      value: {
        sum: 7,
        nested: {
          api_key: "PRIVATE_SENTINEL",
          session_token: "PRIVATE_SENTINEL",
          text: "password=PRIVATE_SENTINEL",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_SENTINEL");
    expect(result.masked).toBe(true);
    expect(JSON.parse(String(result.value)).sum).toBe(7);
  });
  it("caps multibyte egress and reports partial output", () => {
    const result = preparePageMethodReturnData({
      available: true,
      value: "한".repeat(8000),
    });
    expect(result.truncated).toBe(true);
    expect(result.utf8_bytes).toBeLessThanOrEqual(8192);
  });
});
