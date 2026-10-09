import { describe, expect, it } from "vitest";
import { pageResourceToolSchemas } from "../../../src/service-worker/page-resource-schemas.js";
import { createPageResourceProgress } from "../../../src/service-worker/page-resource-progress.js";

describe("source tool provider schema compatibility", () => {
  it("offers optional primitive types without nullable unions that became strings in live calls", () => {
    for (const tool of pageResourceToolSchemas) {
      const schema = tool.function.parameters as {
        properties: Record<string, { type: string }>;
        required?: string[];
      };
      for (const [key, value] of Object.entries(schema.properties)) {
        expect(typeof value.type).toBe("string");
        if (["cursor", "page_size", "offset", "max_bytes"].includes(key))
          expect(schema.required ?? []).not.toContain(key);
      }
    }
  });

  it("invalidates cumulative coverage after body revision drift even with the same inventory revision", () => {
    const progress = createPageResourceProgress();
    const page = [{ resource_id: "resource-abcdefghijkl", available: true }];
    expect(
      progress.record("inventory-v1", "query", page, 1, false).complete,
    ).toBe(true);
    progress.resetOnSourceChange(new Error("SOURCE_CHANGED"));
    expect(
      progress.record("inventory-v1", "query", [], 1, false),
    ).toMatchObject({ inspected_count: 0, complete: false });
  });
});
