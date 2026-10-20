import { z } from "zod";
export const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
export const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const revision = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const refSchema = z.strictObject({
  id,
  partitionId: id,
  revision,
  kind: z.enum([
    "page",
    "entity",
    "action",
    "argument",
    "dataset",
    "predicate",
    "prepared",
    "tab",
    "route",
    "resource",
  ]),
});
export const contextSchema = z.strictObject({
  taskId: id,
  stepId: id,
  mode: z.enum(["ask", "act"]),
  runtimeEpoch: revision,
  planRevision: revision,
  cancellationGeneration: revision,
  profileId: id,
  partitionId: id,
  windowId: revision,
  tabId: revision,
  frameId: revision,
  documentId: id,
  documentEpoch: revision,
  routeEpoch: revision,
  graphRevision: revision,
  entityRevision: revision,
  capabilityRevision: revision,
  capabilityDigest: hash,
  policyRevision: revision,
  policyDigest: hash,
  leaseId: id,
  leaseExpiresAt: revision,
  deadline: revision,
});
export const effectSchema = z.strictObject({
  mechanism: z.enum(["read", "navigate", "edit_control", "invoke_registered"]),
  business: z.enum([
    "read_only",
    "unsubmitted",
    "write",
    "destructive",
    "external_transfer",
    "unknown",
  ]),
  bulk: z.boolean(),
  sensitive: z.boolean(),
  disclosure: z.boolean(),
});
export type ToolContext = z.infer<typeof contextSchema>;
export type SemanticRef = z.infer<typeof refSchema>;
export type Effect = z.infer<typeof effectSchema>;
