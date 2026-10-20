import { walk, type WalkBudget } from "../dom/walk.js";
import { safeUrl } from "../dom/privacy.js";
export interface FrameSurvey {
  frames: { id: string; depth: number; origin: string; nodes: number }[];
  examined: number;
  gaps: string[];
  closedShadow: "unavailable";
}
export async function surveyFrames(
  root: Document,
  options: {
    signal: AbortSignal;
    current(): boolean;
    allow(origin: string): boolean;
    frameId(element: HTMLIFrameElement): string | null;
    now?: () => number;
    deadline?: number;
  },
): Promise<FrameSurvey> {
  const now = options.now ?? Date.now;
  const budget: WalkBudget = {
    examined: 0,
    redactions: 0,
    omitted: 0,
    reasons: new Set(),
    deadline: Math.min(now() + 10000, options.deadline ?? Infinity),
    now,
    signal: options.signal,
    current: options.current,
  };
  const result: FrameSurvey = {
    frames: [],
    examined: 0,
    gaps: [],
    closedShadow: "unavailable",
  };
  let frameCount = 1;
  async function scan(
    document: Document,
    id: string,
    depth: number,
    parentOrigin?: string,
  ): Promise<void> {
    if (!document.documentElement) return;
    const url = new URL(document.URL);
    const origin =
      url.protocol === "about:" ? (parentOrigin ?? "null") : url.origin;
    if (!options.allow(origin)) {
      budget.reasons.add("FRAME_DENIED");
      return;
    }
    const record = { id, depth, origin, nodes: 0 };
    result.frames.push(record);
    for await (const element of walk(document.documentElement, budget)) {
      record.nodes++;
      if (element.tagName.includes("-") && !element.shadowRoot)
        budget.reasons.add("CLOSED_SHADOW_UNOBSERVABLE");
      if (element.tagName !== "IFRAME") continue;
      if (frameCount >= 8 || depth >= 4) {
        budget.reasons.add("FRAME_LIMIT");
        continue;
      }
      frameCount++;
      const frame = element as HTMLIFrameElement;
      const url = safeUrl(frame.getAttribute("src") ?? "", document.URL);
      if (url && !options.allow(url.origin)) {
        budget.reasons.add("FRAME_DENIED");
        continue;
      }
      try {
        const child = frame.contentDocument;
        const childId = options.frameId(frame);
        if (!child || !childId) {
          budget.reasons.add("FRAME_UNAVAILABLE");
          continue;
        }
        await scan(child, childId, depth + 1, origin);
      } catch {
        budget.reasons.add("FRAME_UNAVAILABLE");
      }
    }
  }
  await scan(root, "root", 0);
  result.examined = budget.examined;
  result.gaps = [...budget.reasons];
  return result;
}
