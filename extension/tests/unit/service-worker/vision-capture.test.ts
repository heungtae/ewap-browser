import { describe, expect, it } from "vitest";
import {
  normalizeViewportCapture,
  normalizeZoomRegion,
} from "../../../src/service-worker/vision-capture.js";

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
  it("accepts normalized crop regions and rejects pixel/out-of-bounds inputs", () => {
    expect(
      normalizeZoomRegion({ left: 0.1, top: 0.2, right: 0.8, bottom: 0.9 }),
    ).toEqual({ left: 0.1, top: 0.2, right: 0.8, bottom: 0.9 });
    expect(() =>
      normalizeZoomRegion({ left: 0, top: 0, right: 2, bottom: 1 }),
    ).toThrow("INVALID_ARGUMENT");
  });
});
