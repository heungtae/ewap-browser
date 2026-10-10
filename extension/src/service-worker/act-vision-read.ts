import type { PageResourceOptions } from "./page-resource-store.js";
import { isPlainObject } from "../security/validation.js";
import type { ProviderMessage } from "../providers/types.js";
export const approvedVisionRead = async (
  opts: PageResourceOptions & { enabled(): boolean },
  execute: () => Promise<unknown>,
): Promise<unknown> => {
  const active = () =>
    !opts.signal?.aborted && opts.current() && opts.enabled();
  const safe = async () => {
    const result = await opts.tabs.sendMessage(opts.tabId, {
      kind: "CONTENT_COMPONENT_VISION_CHECK",
      document_epoch: opts.documentEpoch,
    });
    return (
      active() &&
      isPlainObject(result) &&
      result.safe === true &&
      result.document_epoch === opts.documentEpoch
    );
  };
  if (!active()) return { status: "CANCELLED" };
  if (!(await safe()))
    return { status: "DENIED", code: "SENSITIVE_VISION_UNSUPPORTED" };
  if (!(await opts.consent(["component-vision"]))) return { status: "DENIED" };
  if (!(await safe())) return { status: "CANCELLED" };
  const result = await execute();
  if (!(await safe())) return { status: "CANCELLED" };
  return result;
};
export const visionReadMessages = (
  name: string,
  result: unknown,
): { result: unknown; image?: ProviderMessage } => {
  if (
    !["screenshot", "zoom", "read_component_data"].includes(name) ||
    !isPlainObject(result) ||
    typeof result.data_url !== "string" ||
    typeof result.capture_id !== "string"
  )
    return { result };
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(result.data_url))
    return { result: { status: "FAILED", code: "VISION_CAPTURE_UNAVAILABLE" } };
  return {
    result: {
      status: "AVAILABLE",
      capture_id: result.capture_id,
      mime_type: result.mime_type,
      estimated: true,
      coverage: {
        scope: "viewport_image",
        complete: false,
        truncated: true,
        reason: "VISUAL_ESTIMATE_NOT_UNDERLYING_DATA",
      },
      limitations: [
        "VISUAL_ESTIMATE_NOT_UNDERLYING_DATA",
        "NO_ACTION_COORDINATES",
      ],
    },
    image: {
      role: "user",
      content:
        "[UNTRUSTED_VISUAL_EVIDENCE] Transient approved viewport image. Estimates only; no action coordinates.",
      image_data_urls: [result.data_url],
    },
  };
};
