import { opaqueId } from "../security/canonical.js";
import { fail } from "../security/validation.js";

const dataUrl = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/;

export type VisionCapture = {
  capture_id: string;
  mime_type: "image/png" | "image/jpeg";
  data_url: string;
};
export type ZoomRegion = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** The adapter returns an in-memory provider tool result only; callers must not persist it. */
export const normalizeViewportCapture = (value: string): VisionCapture => {
  const match = dataUrl.exec(value);
  if (!match) return fail("VISION_CAPTURE_UNAVAILABLE");
  const base64 = match[2];
  if (!base64) return fail("VISION_CAPTURE_UNAVAILABLE");
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > 1_400_000) return fail("PAYLOAD_LIMIT_EXCEEDED");
  return {
    capture_id: opaqueId(),
    mime_type: match[1] as "image/png" | "image/jpeg",
    data_url: value,
  };
};

/** Normalized regions keep screenshot reads separate from page-coordinate authority. */
export const normalizeZoomRegion = (value: unknown): ZoomRegion => {
  if (typeof value !== "object" || value === null)
    return fail("INVALID_ARGUMENT");
  const region = value as Record<string, unknown>;
  if (
    Object.keys(region).some(
      (key) => !["left", "top", "right", "bottom"].includes(key),
    ) ||
    ![region.left, region.top, region.right, region.bottom].every(
      (item) => typeof item === "number" && Number.isFinite(item),
    ) ||
    (region.left as number) < 0 ||
    (region.top as number) < 0 ||
    (region.right as number) > 1 ||
    (region.bottom as number) > 1 ||
    (region.left as number) >= (region.right as number) ||
    (region.top as number) >= (region.bottom as number)
  )
    return fail("INVALID_ARGUMENT");
  return {
    left: region.left as number,
    top: region.top as number,
    right: region.right as number,
    bottom: region.bottom as number,
  };
};

const blobDataUrl = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
};

/** Crop/downscale only a transient viewport capture; never turn it into an action target. */
export const zoomViewportCapture = async (
  capture: VisionCapture,
  region: ZoomRegion,
): Promise<VisionCapture> => {
  const image = await createImageBitmap(
    await (await fetch(capture.data_url)).blob(),
  );
  try {
    const sourceWidth = Math.floor(image.width * (region.right - region.left));
    const sourceHeight = Math.floor(
      image.height * (region.bottom - region.top),
    );
    if (sourceWidth < 1 || sourceHeight < 1) return fail("INVALID_ARGUMENT");
    const scale = Math.min(1, 1568 / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.floor(sourceWidth * scale));
    const height = Math.max(1, Math.floor(sourceHeight * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return fail("VISION_CAPTURE_UNAVAILABLE");
    context.drawImage(
      image,
      Math.floor(image.width * region.left),
      Math.floor(image.height * region.top),
      sourceWidth,
      sourceHeight,
      0,
      0,
      width,
      height,
    );
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.75,
    });
    return normalizeViewportCapture(await blobDataUrl(blob));
  } finally {
    image.close();
  }
};
