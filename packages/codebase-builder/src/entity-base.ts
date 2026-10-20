import {
  digest,
  opaque,
  type Batch,
  type Entity,
} from "@contextpilot/codebase-schema";
export async function pageEntity(batch: Batch): Promise<Entity> {
  const c = batch.context;
  return {
    id: await opaque("entity", [c.partitionId, c.pageKey, "page"]),
    partitionId: c.partitionId,
    pageKey: c.pageKey,
    parentId: null,
    kind: "page",
    name: "page",
    status: "observed",
    evidenceIds: [],
    structureFingerprint: await digest([c.partitionId, c.pageKey]),
    stateFingerprint: await digest(c.source),
    fingerprintVersion: "structure-v1",
    stableKey: null,
    capability: null,
    fields: [],
    sample: [],
    state: null,
    semanticAnnotation: null,
  };
}
