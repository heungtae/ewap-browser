import { opaqueId } from "../security/canonical.js";
import { fail } from "../security/validation.js";

const dataUrl = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/;

export type VisionCapture = {
  capture_id: string;
  mime_type: "image/png" | "image/jpeg";
  data_url: string;
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
