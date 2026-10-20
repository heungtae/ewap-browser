import { Relationships } from "./relationships.js";
import {
  batchBodySchema,
  batchSchema,
  bytes,
  digest,
  type Batch,
  type Context,
  type Coverage,
  type Observation,
} from "@contextpilot/codebase-schema";
import { walk, type WalkBudget } from "./walk.js";
import { control, kind, role } from "./classify.js";
import { normaliseRecord } from "./normalise.js";
export interface CollectOptions {
  batchId: string;
  context: Context;
  expectedRevision: number;
  scope: "visible_only" | "all_dom";
  signal?: AbortSignal;
  now?: () => number;
  deadline?: number;
  current(): boolean;
}
export async function collect(
  root: Element,
  options: CollectOptions,
): Promise<Batch> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const budget: WalkBudget = {
    examined: 0,
    redactions: 0,
    omitted: 0,
    reasons: new Set(),
    deadline: Math.min(startedAt + 10_000, options.deadline ?? Infinity),
    now,
    current: options.current,
    ...(options.signal ? { signal: options.signal } : {}),
  };
  const records: Observation[] = [];
  const ids = new WeakMap<Element, string>();
  const nearest = new WeakMap<Element, string | null>();
  const relationships = new Relationships();
  const seed = (await digest(options.batchId)).slice(0, 16);
  let ordinal = 0;
  for await (const element of walk(root, budget)) {
    const tree = element.getRootNode();
    const ancestor =
      element.parentElement ??
      ("host" in tree ? (tree as ShadowRoot).host : null);
    nearest.set(
      element,
      ancestor ? (ids.get(ancestor) ?? nearest.get(ancestor) ?? null) : null,
    );
    relationships.observe(element, budget);
    const r = role(element);
    const k = kind(element, r);
    const c = control(element, r);
    if (element.tagName === "IFRAME") {
      budget.reasons.add("FRAME_UNAVAILABLE");
      budget.omitted++;
    }
    if (!k && !c) continue;
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    const visible =
      !element.hasAttribute("hidden") &&
      style?.display !== "none" &&
      style?.visibility !== "hidden" &&
      element.getClientRects().length > 0;
    if (!visible && options.scope === "visible_only") {
      budget.omitted++;
      continue;
    }
    const evidenceId = `ev_${seed}_${++ordinal}`;
    ids.set(element, evidenceId);
    const record = await normaliseRecord(element, budget, {
      evidenceId,
      parentEvidenceId: nearest.get(element) ?? null,
      sourceLocation: await digest([options.context.source, ordinal]),
      visible,
      role: r,
      kind: k,
      control: c,
    });
    records.push(record);
    relationships.attach(element, record);
  }
  relationships.apply(ids);
  const selected = records
    .map((r, index) => ({ r, index }))
    .sort(
      (a, b) =>
        (a.r.kind ? 0 : a.r.control ? 1 : 2) -
          (b.r.kind ? 0 : b.r.control ? 1 : 2) || a.index - b.index,
    )
    .slice(0, 1000)
    .map((x) => x.r);
  if (selected.length < records.length) {
    budget.reasons.add("OUTPUT_LIMIT");
    budget.omitted += records.length - selected.length;
  }
  const body = (items: Observation[]) => {
    const admitted = new Set(items.map((r) => r.evidenceId));
    const repaired = items.map((r) => ({
      ...r,
      parentEvidenceId:
        r.parentEvidenceId && admitted.has(r.parentEvidenceId)
          ? r.parentEvidenceId
          : null,
    }));
    const coverage: Coverage = {
      status: budget.reasons.size || budget.omitted ? "partial" : "complete",
      examined: budget.examined,
      emitted: repaired.length,
      omitted: budget.omitted,
      redactions: budget.redactions,
      total: budget.reasons.has("NODE_LIMIT") ? null : records.length,
      reasons: [...budget.reasons] as Coverage["reasons"],
      startedAt,
      endedAt: now(),
      deadline: budget.deadline,
    };
    return batchBodySchema.parse({
      schema: "wca.codebase/v1",
      batchId: options.batchId,
      context: options.context,
      expectedRevision: options.expectedRevision,
      collectorVersion: "dom-v1",
      budgetVersion: "construction-v1",
      scope: options.scope,
      observedAt: startedAt,
      records: repaired,
      coverage,
    });
  };
  let result = body(selected);
  if (bytes(result) > 262144) {
    budget.reasons.add("BYTE_LIMIT");
    let low = 0,
      high = selected.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (bytes(body(selected.slice(0, middle))) <= 262144) low = middle;
      else high = middle - 1;
    }
    budget.omitted += selected.length - low;
    selected.length = low;
    result = body(selected);
  }
  if (now() >= budget.deadline) {
    budget.reasons.add("UNIT_TIMEOUT");
    result = body(selected);
  }
  while (bytes(result) > 262144) {
    selected.pop();
    budget.omitted++;
    result = body(selected);
  }
  return batchSchema.parse({
    ...result,
    digest: await digest(result),
    bytes: bytes(result),
  });
}
