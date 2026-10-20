import type { CollectorBudget } from "./budget.js";
import { evidence, validateEvidence } from "./evidence.js";
import type { AdvancedEvidence } from "./contracts.js";
import { transientVisual, type VisualPorts } from "./visual.js";
import type { Context } from "@contextpilot/codebase-schema";
export async function collectChart(options: {
  id: string;
  context: Context;
  channel: "accessible" | "registered" | "visual";
  signal: AbortSignal;
  budget: CollectorBudget;
  accessible?: () => Promise<AdvancedEvidence>;
  registered?: () => Promise<AdvancedEvidence>;
  visual?: VisualPorts;
}) {
  const read =
    options.accessible ??
    (options.channel !== "accessible" ? options.registered : undefined);
  if (read) {
    const data = await validateEvidence(
      await read(),
      options.context,
      Date.now(),
    );
    if (data.provenance === "visual_inferred")
      throw new Error("CHART_SOURCE_DENIED");
    const { digest: _digest, ...body } = data;
    return evidence({ ...body, id: options.id, kind: "chart" });
  }
  if (options.channel !== "visual" || !options.visual)
    throw new Error("CHART_CHANNEL_UNAVAILABLE");
  const visual = await transientVisual(
    options.visual,
    options.signal,
    options.budget,
  );
  const now = Date.now();
  return evidence({
    schema: "wca.collector/v1",
    id: options.id,
    context: options.context,
    kind: "chart",
    provenance: "visual_inferred",
    rows: [[visual.text]],
    rowIds: ["row_inferred"],
    fields: ["interpretation"],
    coverage: {
      status: "partial",
      reasons: ["VISUAL_INFERRED"],
      total: null,
      windows: 1,
      restored: null,
    },
    observedAt: now,
    expiresAt: now + 10000,
    executable: false,
  });
}
