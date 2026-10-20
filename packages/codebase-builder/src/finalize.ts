import {
  digest,
  validateDelta,
  type Batch,
  type Entity,
  type Edge,
  type Evidence,
  type Coverage,
} from "@contextpilot/codebase-schema";
export async function finalize(
  batch: Batch,
  prior: Entity[],
  entities: Entity[],
  edges: Edge[],
  evidence: Evidence[],
  omitted: number,
  reasons: Set<Coverage["reasons"][number]>,
  examined: { components: number; actions: number; routes: number },
) {
  const c = batch.context;
  const current = new Map(entities.map((e) => [e.id, e]));
  // Partial discovery cannot prove removal of an unvisited node.
  const tombstones =
    batch.coverage.status === "complete" && omitted === 0
      ? prior.filter((e) => !current.has(e.id)).map((e) => e.id)
      : [];
  const invalidations = prior
    .filter(
      (e) =>
        tombstones.includes(e.id) ||
        current.get(e.id)?.structureFingerprint !== e.structureFingerprint,
    )
    .map((e) => e.id);
  const coverage = {
    ...batch.coverage,
    omitted: batch.coverage.omitted + omitted,
    reasons: [...reasons],
    status: omitted ? ("partial" as const) : batch.coverage.status,
  };
  const stage = (count: number, limit: number) => ({
    examined: count,
    emitted: Math.min(count, limit),
    omitted: Math.max(0, count - limit),
    deadline: batch.coverage.deadline,
    status:
      count > limit || batch.coverage.status !== "complete"
        ? ("partial" as const)
        : ("complete" as const),
  });
  const body = {
    schema: "wca.codebase/v1" as const,
    algorithm: "builder-v1" as const,
    batchId: batch.batchId,
    batchDigest: batch.digest,
    generation: {
      components: stage(examined.components, 128),
      actions: stage(examined.actions, 256),
      routes: stage(examined.routes, 128),
    },
    context: c,
    expectedRevision: batch.expectedRevision,
    entities,
    edges,
    evidence,
    tombstones,
    invalidations,
    coverage,
  };
  return validateDelta({ ...body, digest: await digest(body) }, prior);
}
