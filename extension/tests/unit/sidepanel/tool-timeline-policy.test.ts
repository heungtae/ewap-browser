import { describe, expect, it } from "vitest";
import { shouldRenderToolTimelineCard } from "../../../src/sidepanel/tool-timeline-policy.js";

describe("tool timeline policy", () => {
  it("keeps an approved action on its existing proposal card", () => {
    expect(shouldRenderToolTimelineCard(true)).toBe(false);
  });

  it("keeps independent read-only tools in the timeline", () => {
    expect(shouldRenderToolTimelineCard(false)).toBe(true);
  });
});
