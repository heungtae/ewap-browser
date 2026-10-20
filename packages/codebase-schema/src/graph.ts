import { z } from "zod";
import {
  capabilitySchema,
  contextSchema,
  coverageSchema,
  fieldSchema,
  hash,
  id,
  revision,
} from "./common.js";
import { componentKinds, observationSchema } from "./observation.js";
export const entitySchema = z.strictObject({
  id,
  partitionId: id,
  pageKey: id,
  parentId: id.nullable(),
  kind: z.enum([
    "page",
    ...componentKinds,
    "control",
    "action",
    "data",
    "route",
    "workflow",
  ]),
  name: z.string().max(200),
  status: z.enum(["observed", "stale", "tombstone", "advisory"]),
  evidenceIds: z.array(id).max(1000),
  structureFingerprint: hash,
  stateFingerprint: hash,
  fingerprintVersion: z.literal("structure-v1"),
  stableKey: hash.nullable(),
  capability: capabilitySchema.nullable(),
  fields: z.array(fieldSchema).max(20),
  sample: z.array(z.array(z.string().max(200)).max(20)).max(5),
  state: z
    .strictObject({
      visible: z.boolean(),
      enabled: z.boolean(),
      editable: z.boolean(),
      checked: z.boolean().nullable(),
      selected: z.boolean().nullable(),
    })
    .nullable(),
  semanticAnnotation: z.null(),
});
export const evidenceSchema = z
  .strictObject({
    id,
    partitionId: id,
    sourceLocation: hash,
    observedAt: revision,
    status: z.enum(["observed", "inferred", "verified"]),
    predicate: z.string().max(128).nullable(),
    sourceRevision: revision,
    digest: hash,
    observation: observationSchema,
  })
  .superRefine((e, c) => {
    if ((e.status === "verified") !== (e.predicate !== null))
      c.addIssue({ code: "custom", message: "PREDICATE_REQUIRED" });
  });
export const edgeSchema = z.strictObject({
  id,
  partitionId: id,
  from: id,
  to: id,
  kind: z.enum([
    "contains",
    "supports",
    "describes",
    "route_candidate",
    "advisory_history",
  ]),
  evidenceIds: z.array(id).min(1).max(32),
  status: z.enum(["observed", "inferred", "stale"]),
});
const stageSchema = z.strictObject({
  examined: revision.max(1000),
  emitted: revision.max(1000),
  omitted: revision.max(1000),
  deadline: revision,
  status: z.enum(["complete", "partial"]),
});
export const generationSchema = z.strictObject({
  components: stageSchema,
  actions: stageSchema,
  routes: stageSchema,
});
export const deltaBodySchema = z.strictObject({
  schema: z.literal("wca.codebase/v1"),
  algorithm: z.literal("builder-v1"),
  batchId: id,
  batchDigest: hash,
  generation: generationSchema,
  context: contextSchema,
  expectedRevision: revision,
  entities: z.array(entitySchema).max(2500),
  edges: z.array(edgeSchema).max(5000),
  evidence: z.array(evidenceSchema).max(1000),
  tombstones: z.array(id).max(2500),
  invalidations: z.array(id).max(2500),
  coverage: coverageSchema.refine(
    (c) => c.examined <= 5000 && c.emitted <= 1000,
    "DISCOVERY_LIMIT",
  ),
});
export const deltaSchema = deltaBodySchema.extend({ digest: hash });
export const snapshotSchema = z.strictObject({
  repositoryId: id,
  generation: generationSchema,
  partitionId: id,
  pageKey: id,
  revision,
  context: contextSchema,
  digest: hash,
  entities: z.array(entitySchema).max(2500),
  edges: z.array(edgeSchema).max(5000),
  evidence: z.array(evidenceSchema).max(1000),
  coverage: coverageSchema.refine(
    (c) => c.examined <= 5000 && c.emitted <= 1000,
    "DISCOVERY_LIMIT",
  ),
  expiresAt: revision,
});
export type Entity = z.infer<typeof entitySchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Edge = z.infer<typeof edgeSchema>;
export type Delta = z.infer<typeof deltaSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
