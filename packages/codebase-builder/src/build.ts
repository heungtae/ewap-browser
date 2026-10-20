import { pageEntity } from "./entity-base.js";
import { addSingleton } from "./singleton.js";
import { finalize } from "./finalize.js";
import {
  digest,
  opaque,
  validateBatch,
  type Batch,
  type Delta,
  type Entity,
  type Evidence,
  type Edge,
} from "@contextpilot/codebase-schema";
import { entityIdentity, fingerprints } from "./identity.js";
import { capability } from "./actions.js";
export async function buildGraph(
  input: Batch,
  prior: Entity[] = [],
): Promise<Delta> {
  const batch = await validateBatch(input);
  const c = batch.context;
  if (
    prior.some(
      (e) => e.partitionId !== c.partitionId || e.pageKey !== c.pageKey,
    )
  )
    throw new Error("PRIOR_SCOPE");
  if (
    batch.coverage.reasons.some(
      (r) => r === "CANCELLED" || r === "DOCUMENT_CHANGED",
    )
  )
    throw new Error("LATE_OBSERVATION");
  const page = await pageEntity(batch);
  const pageId = page.id;
  const entities: Entity[] = [page];
  const edges: Edge[] = [];
  const evidence: Evidence[] = [];
  const mapped = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const r of batch.records) {
    const key = JSON.stringify([
      r.parentEvidenceId,
      r.stableKey ?? [r.role, r.kind, r.name],
    ]);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let components = 0;
  let actions = 0;
  let routes = 0;
  let omitted = 0;
  const reasons = new Set(batch.coverage.reasons);
  for (const r of batch.records) {
    const f = await fingerprints(r);
    const parentId =
      (r.parentEvidenceId ? mapped.get(r.parentEvidenceId) : undefined) ??
      pageId;
    const duplicate =
      (counts.get(
        JSON.stringify([
          r.parentEvidenceId,
          r.stableKey ?? [r.role, r.kind, r.name],
        ]),
      ) ?? 0) > 1;
    const mainId = await entityIdentity(
      r,
      parentId,
      prior,
      batch.batchId,
      duplicate,
      f.structureFingerprint,
    );
    const root: Entity = {
      ...page,
      ...f,
      id: mainId,
      parentId,
      kind: r.kind ?? "control",
      name: r.name,
      status: "observed",
      evidenceIds: [r.evidenceId],
      stableKey: r.stableKey,
      state: {
        visible: r.visible,
        enabled: r.enabled,
        editable: r.editable,
        checked: r.checked,
        selected: r.selected,
      },
    };
    evidence.push({
      id: r.evidenceId,
      partitionId: c.partitionId,
      sourceLocation: r.sourceLocation,
      observedAt: batch.observedAt,
      status: "observed",
      predicate: null,
      sourceRevision: c.source.sourceRevision,
      digest: await digest(r),
      observation: r,
    });
    if (r.kind && ++components > 128) {
      reasons.add("COMPONENT_LIMIT");
      omitted++;
      continue;
    }
    if (!r.kind && r.control && parentId === pageId) {
      if (++components <= 128) {
        await addSingleton(root, entities, edges);
      } else {
        reasons.add("COMPONENT_LIMIT");
        omitted++;
      }
    }
    entities.push(root);
    mapped.set(r.evidenceId, mainId);
    edges.push({
      id: await opaque("edge", [parentId, mainId]),
      partitionId: c.partitionId,
      from: root.parentId!,
      to: mainId,
      kind: "contains",
      evidenceIds: [r.evidenceId],
      status: "observed",
    });
    const action = capability(r);
    if (action) {
      if (++actions <= 256) {
        const actionId = await opaque("entity", [mainId, action.tool]);
        entities.push({
          ...root,
          id: actionId,
          parentId: mainId,
          kind: "action",
          stableKey: null,
          capability: action,
        });
        edges.push({
          id: await opaque("edge", [mainId, actionId]),
          partitionId: c.partitionId,
          from: mainId,
          to: actionId,
          kind: "supports",
          evidenceIds: [r.evidenceId],
          status: "observed",
        });
      } else {
        reasons.add("ACTION_LIMIT");
        omitted++;
      }
    }
    if (r.kind === "table" || r.kind === "grid")
      entities.push({
        ...root,
        id: await opaque("entity", [mainId, "data"]),
        parentId: mainId,
        kind: "data",
        stableKey: null,
        fields: r.headers.map((name) => ({
          name,
          type: "unknown" as const,
          required: null,
          unit: null,
        })),
        sample: r.sample,
      });
    if (r.routeKey) {
      if (++routes <= 128)
        entities.push({
          ...root,
          id: await opaque("entity", [mainId, "route"]),
          parentId: mainId,
          kind: "route",
          stableKey: r.routeKey,
        });
      else {
        reasons.add("ROUTE_LIMIT");
        omitted++;
      }
    }
  }
  return finalize(batch, prior, entities, edges, evidence, omitted, reasons, {
    components,
    actions,
    routes,
  });
}
