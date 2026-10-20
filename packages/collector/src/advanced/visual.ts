import type { CollectorBudget } from "./budget.js";
export interface VisualPorts {
  consent(): void;
  capture(signal: AbortSignal): Promise<{ data: Uint8Array; dispose(): void }>;
  mask(data: Uint8Array, signal: AbortSignal): Promise<Uint8Array | null>;
  interpret(masked: Uint8Array, signal: AbortSignal): Promise<string>;
}
export async function transientVisual(
  ports: VisualPorts,
  signal: AbortSignal,
  budget: CollectorBudget,
) {
  ports.consent();
  budget.reserveCapture();
  if (signal.aborted) throw new Error("CANCELLED");
  const image = await ports.capture(signal);
  let masked: Uint8Array | null = null;
  try {
    if (image.data.byteLength > 2 * 1024 * 1024)
      throw new Error("SCREENSHOT_BYTE_LIMIT");
    ports.consent();
    masked = await ports.mask(image.data, signal);
    if (!masked || masked.byteLength > 2 * 1024 * 1024)
      throw new Error("SCREENSHOT_UNMASKABLE");
    ports.consent();
    if (signal.aborted) throw new Error("CANCELLED");
    const text = await ports.interpret(masked, signal);
    ports.consent();
    if (signal.aborted || text.length > 4096) throw new Error("VISUAL_LIMIT");
    const { scrub } = await import("../dom/privacy.js");
    return {
      text: scrub(text, 4096),
      provenance: "visual_inferred" as const,
      executable: false as const,
      coverage: "partial" as const,
    };
  } finally {
    image.data.fill(0);
    masked?.fill(0);
    image.dispose();
  }
}
