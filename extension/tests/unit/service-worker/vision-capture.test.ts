import { describe, expect, it } from "vitest";
import { normalizeViewportCapture } from "../../../src/service-worker/vision-capture.js";

describe("vision capture", () => {
  it("accepts only bounded image data URLs", () => {
    expect(
      normalizeViewportCapture("data:image/png;base64,aGVsbG8="),
    ).toMatchObject({
      mime_type: "image/png",
    });
  });
  it("rejects non-image and oversized inputs before provider delivery", () => {
    expect(() =>
      normalizeViewportCapture("data:text/plain;base64,aGVsbG8="),
    ).toThrow("VISION_CAPTURE_UNAVAILABLE");
    expect(() =>
      normalizeViewportCapture(
        `data:image/png;base64,${"A".repeat(1_900_000)}`,
      ),
    ).toThrow("PAYLOAD_LIMIT_EXCEEDED");
  });
});
