import { describe, expect, it, vi } from "vitest";
import { createAskVisionToolExecutor } from "../../../src/service-worker/ask-vision-tool-executor.js";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";
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
  it("rejects disabled capture before touching Chrome", async () => {
    const query = vi.fn();
    const captureVisibleTab = vi.fn();
    const vision = createAskVisionToolExecutor({
      enabled: false,
      tabId: 7,
      tabs: { query, captureVisibleTab } as unknown as BrowserTabs,
      capture: () => undefined,
      remember: vi.fn(),
    });
    await expect(vision.screenshot("{}")).rejects.toThrow(
      "VISION_CAPTURE_UNAVAILABLE",
    );
    expect(query).not.toHaveBeenCalled();
    expect(captureVisibleTab).not.toHaveBeenCalled();
  });
  it("discards a viewport if the active tab changes during capture", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 7, windowId: 3 }])
      .mockResolvedValueOnce([{ id: 8, windowId: 3 }]);
    const captureVisibleTab = vi
      .fn()
      .mockResolvedValue("data:image/png;base64,aGVsbG8=");
    const remember = vi.fn();
    const vision = createAskVisionToolExecutor({
      enabled: true,
      tabId: 7,
      tabs: { query, captureVisibleTab } as unknown as BrowserTabs,
      capture: () => undefined,
      remember,
    });
    await expect(vision.screenshot("{}")).rejects.toThrow("TARGET_STALE");
    expect(captureVisibleTab).toHaveBeenCalledOnce();
    expect(remember).not.toHaveBeenCalled();
  });
  it("returns a closed error when Chrome denies capture permission", async () => {
    const captureVisibleTab = vi.fn().mockRejectedValue(new Error("denied"));
    const remember = vi.fn();
    const vision = createAskVisionToolExecutor({
      enabled: true,
      tabId: 7,
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 7, windowId: 3 }]),
        captureVisibleTab,
      } as unknown as BrowserTabs,
      capture: () => undefined,
      remember,
    });
    await expect(vision.screenshot("{}")).rejects.toThrow(
      "VISION_CAPTURE_UNAVAILABLE",
    );
    expect(remember).not.toHaveBeenCalled();
  });
});
