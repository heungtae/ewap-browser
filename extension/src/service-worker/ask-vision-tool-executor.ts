import {
  normalizeViewportCapture,
  normalizeZoomRegion,
  zoomViewportCapture,
  type VisionCapture,
} from "./vision-capture.js";
import type { BrowserTabs } from "./browser-api.js";
import { fail, isPlainObject } from "../security/validation.js";

type Dependencies = {
  enabled: boolean;
  tabs: BrowserTabs;
  tabId: number;
  capture(id: string): VisionCapture | undefined;
  remember(capture: VisionCapture): void;
};

export const createAskVisionToolExecutor = (dependencies: Dependencies) => ({
  async screenshot(argumentsValue: string): Promise<unknown> {
    if (argumentsValue !== "{}") return fail("INVALID_ARGUMENT");
    if (!dependencies.enabled) return fail("VISION_CAPTURE_UNAVAILABLE");
    const tab = (
      await dependencies.tabs.query({ active: true, lastFocusedWindow: true })
    )[0];
    if (!tab || tab.id !== dependencies.tabId) return fail("TARGET_STALE");
    const capture = normalizeViewportCapture(
      await dependencies.tabs.captureVisibleTab(tab.windowId, {
        format: "jpeg",
        quality: 75,
      }),
    );
    dependencies.remember(capture);
    return capture;
  },
  async zoom(args: unknown): Promise<unknown> {
    if (
      !isPlainObject(args) ||
      Object.keys(args).some(
        (key) => !["capture_id", "region"].includes(key),
      ) ||
      typeof args.capture_id !== "string"
    )
      return fail("INVALID_ARGUMENT");
    const capture = dependencies.capture(args.capture_id);
    if (!capture) return fail("VISION_CAPTURE_UNAVAILABLE");
    const zoomed = await zoomViewportCapture(
      capture,
      normalizeZoomRegion(args.region),
    );
    dependencies.remember(zoomed);
    return zoomed;
  },
});
