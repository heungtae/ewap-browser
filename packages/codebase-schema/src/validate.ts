import { batchSchema, type Batch } from "./observation.js";
import { deltaSchema, type Delta, type Entity } from "./graph.js";
import { bytes, digest } from "./digest.js";
export async function validateBatch(input: unknown): Promise<Batch> {
  const batch = batchSchema.parse(input);
  const { digest: expected, bytes: length, ...body } = batch;
  if (
    bytes(body) !== length ||
    (await digest(body)) !== expected ||
    length > 262144 ||
    batch.coverage.emitted !== batch.records.length
  )
    throw new Error("BATCH_INTEGRITY");
  const ids = new Set(batch.records.map((r) => r.evidenceId));
  if (ids.size !== batch.records.length)
    throw new Error("DUPLICATE_OBSERVATION");
  for (const r of batch.records)
    if (
      r.parentEvidenceId &&
      (!ids.has(r.parentEvidenceId) || r.parentEvidenceId === r.evidenceId)
    )
      throw new Error("DANGLING_OBSERVATION");
  const parents = new Map(
    batch.records.map((r) => [r.evidenceId, r.parentEvidenceId]),
  );
  for (const record of batch.records) {
    const seen = new Set([record.evidenceId]);
    let parent = record.parentEvidenceId;
    while (parent) {
      if (seen.has(parent)) throw new Error("OBSERVATION_CYCLE");
      seen.add(parent);
      parent = parents.get(parent) ?? null;
    }
  }
  return batch;
}
export async function validateDelta(
  input: unknown,
  existing: Entity[] = [],
): Promise<Delta> {
  const d = deltaSchema.parse(input);
  const { digest: expected, ...body } = d;
  if ((await digest(body)) !== expected) throw new Error("DELTA_INTEGRITY");
  const entities = new Map(
    existing.filter((e) => !d.tombstones.includes(e.id)).map((e) => [e.id, e]),
  );
  const fresh = new Set<string>();
  for (const e of d.entities) {
    if (fresh.has(e.id)) throw new Error("DUPLICATE_ENTITY");
    fresh.add(e.id);
    entities.set(e.id, e);
    if (
      e.partitionId !== d.context.partitionId ||
      e.pageKey !== d.context.pageKey
    )
      throw new Error("CROSS_PARTITION");
  }
  const evidence = new Set(d.evidence.map((e) => e.id));
  if (
    evidence.size !== d.evidence.length ||
    d.evidence.some((e) => e.partitionId !== d.context.partitionId)
  )
    throw new Error("EVIDENCE_SCOPE");
  for (const e of d.evidence)
    if (
      e.id !== e.observation.evidenceId ||
      e.sourceLocation !== e.observation.sourceLocation ||
      (e.observation.parentEvidenceId !== null &&
        !evidence.has(e.observation.parentEvidenceId)) ||
      e.sourceRevision !== d.context.source.sourceRevision ||
      (await digest(e.observation)) !== e.digest
    )
      throw new Error("EVIDENCE_INTEGRITY");
  for (const e of d.entities) {
    if (e.parentId && !entities.has(e.parentId))
      throw new Error("DANGLING_PARENT");
    if (e.parentId && entities.get(e.parentId)?.partitionId !== e.partitionId)
      throw new Error("CROSS_PARTITION_PARENT");
    for (const ref of e.evidenceIds)
      if (!evidence.has(ref)) throw new Error("DANGLING_EVIDENCE");
    const seen = new Set([e.id]);
    let parent = e.parentId;
    while (parent) {
      if (seen.has(parent)) throw new Error("PARENT_CYCLE");
      seen.add(parent);
      parent = entities.get(parent)?.parentId ?? null;
    }
  }
  const edges = new Set<string>();
  for (const e of d.edges) {
    if (edges.has(e.id)) throw new Error("DUPLICATE_EDGE");
    edges.add(e.id);
    if (
      e.partitionId !== d.context.partitionId ||
      !entities.has(e.from) ||
      !entities.has(e.to) ||
      e.evidenceIds.some((id) => !evidence.has(id))
    )
      throw new Error("INVALID_EDGE");
    if (
      [entities.get(e.from), entities.get(e.to)].some(
        (n) => n?.partitionId !== e.partitionId,
      )
    )
      throw new Error("CROSS_PARTITION");
  }
  return d;
}
