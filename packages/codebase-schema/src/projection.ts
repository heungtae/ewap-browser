import { z } from "zod";
import { coverageSchema, hash, id, revision, sourceSchema } from "./common.js";
import { datasetSchema } from "./dataset.js";
import { entitySchema } from "./graph.js";
import {
  projectionOperationSchema,
  projectionQueryResultSchema,
} from "./projection-query.js";
export const projectionScopeSchema = z.strictObject({
  repositoryId: id,
  profileGuard: hash,
  partitionId: id,
  pageKey: id,
  taskId: id,
  runtimeEpoch: revision,
  revision,
  graphDigest: hash,
  source: sourceSchema,
  documentId: z.string().min(1).max(128),
});
export const projectionLeaseSchema = z.strictObject({
  schema: z.literal("wca.codebase-projection/v1"),
  kind: z.literal("lease"),
  id,
  scope: projectionScopeSchema,
  expiresAt: revision,
  permissions: z.strictObject({
    graph: z.boolean(),
    samples: z.boolean(),
    datasets: z.array(z.strictObject({ id, digest: hash })).max(16),
  }),
});
export const projectionRequestSchema = z.strictObject({
  schema: z.literal("wca.codebase-projection/v1"),
  kind: z.literal("codebase.request"),
  requestId: z.string().uuid(),
  connectionId: z.string().uuid(),
  connectionEpoch: revision.min(1),
  leaseId: id,
  scope: projectionScopeSchema,
  operation: projectionOperationSchema,
  deadline: revision,
  maxBytes: revision.min(1).max(8 * 1024 * 1024),
});
export const projectedEntitySchema = entitySchema.omit({ sample: true });
export const evidenceDescriptorSchema = z.strictObject({
  id,
  partitionId: id,
  sourceLocation: hash,
  observedAt: revision,
  status: z.enum(["observed", "inferred", "verified"]),
  predicate: z.string().max(128).nullable(),
  sourceRevision: revision,
  digest: hash,
});
const provenance = {
  coverage: coverageSchema,
  evidence: z.array(evidenceDescriptorSchema).max(1000),
};
export const projectionPayloadSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...provenance,
    kind: z.literal("search"),
    entities: z.array(projectedEntitySchema).max(128),
    matched: revision.max(2500),
    cursor: id.nullable(),
  }),
  z.strictObject({
    ...provenance,
    kind: z.literal("inspect"),
    entity: projectedEntitySchema,
    sample: entitySchema.shape.sample.nullable(),
  }),
  z.strictObject({ kind: z.literal("dataset"), dataset: datasetSchema }),
  z.strictObject({
    kind: z.literal("query"),
    result: projectionQueryResultSchema,
  }),
]);
export const projectionBodySchema = z.strictObject({
  schema: z.literal("wca.codebase-projection/v1"),
  kind: z.literal("projection"),
  requestId: z.string().uuid(),
  leaseId: id,
  scope: projectionScopeSchema,
  operationDigest: hash,
  observedAt: revision,
  expiresAt: revision,
  payload: projectionPayloadSchema,
});
export const projectionPacketSchema = projectionBodySchema.extend({
  digest: hash,
});
export const projectionErrorCodeSchema = z.enum([
  "PROJECTION_DENIED",
  "PROJECTION_STALE",
  "PROJECTION_UNAVAILABLE",
  "PROJECTION_LIMIT",
  "PROJECTION_CANCELLED",
]);
export type ProjectionScope = z.infer<typeof projectionScopeSchema>;
export type ProjectionLease = z.infer<typeof projectionLeaseSchema>;
export type ProjectionRequest = z.infer<typeof projectionRequestSchema>;
export type ProjectionPayload = z.infer<typeof projectionPayloadSchema>;
export type ProjectionPacket = z.infer<typeof projectionPacketSchema>;
export type ProjectionErrorCode = z.infer<typeof projectionErrorCodeSchema>;

export function pairedCodebaseProfile(
  installationId: string,
  profileId: string,
) {
  const uuid =
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (!uuid.test(installationId) || !uuid.test(profileId))
    throw Error("MANAGEMENT_PROFILE");
  return JSON.stringify([installationId, profileId]);
}
export const projectionCancelSchema = z.strictObject({
  schema: z.literal("wca.codebase-projection/v1"),
  kind: z.literal("codebase.cancel"),
  requestId: z.string().uuid(),
  leaseId: id,
  connectionId: z.string().uuid(),
  connectionEpoch: revision.min(1),
});
