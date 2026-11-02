import { z } from "zod";
import { id, revision } from "./common.js";
const scope = z.strictObject({ partitionId: id, pageKey: id });
const patch = z.strictObject({
  name: z.string().max(80).optional(),
  notes: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  autoUpdate: z.boolean().optional(),
});
export const advisoryControlSchema = patch.extend({
  rediscoverRevision: revision.optional(),
});
export const advisoryCatalogSchema = z.strictObject({
  revision,
  enabled: z.boolean(),
});
export const managementCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("advisory.profiles"),
    cursor: z.string().max(512).nullable(),
    filter: z.string().max(80),
    limit: revision.min(1).max(20),
  }),
  z.strictObject({
    kind: z.literal("advisory.workflows"),
    cursor: z.string().max(512).nullable(),
    limit: revision.min(1).max(20),
  }),
  z.strictObject({
    kind: z.literal("advisory.history"),
    scope,
    id,
    cursor: revision,
    limit: revision.min(1).max(128),
  }),
  z.strictObject({
    kind: z.literal("advisory.profile"),
    scope,
    cursor: z.string().max(128).nullable().optional(),
  }),
  z.strictObject({
    kind: z.literal("advisory.feature"),
    revision,
    enabled: z.boolean(),
  }),
  z.strictObject({ kind: z.literal("advisory.clear"), revision }),
  z.strictObject({
    kind: z.literal("advisory.update"),
    revision,
    scope,
    id: id.nullable(),
    patch,
  }),
  z.strictObject({
    kind: z.literal("advisory.rediscover"),
    revision,
    scope,
    id: id.nullable(),
  }),
  z.strictObject({
    kind: z.literal("advisory.delete"),
    revision,
    scope,
    id: id.nullable(),
  }),
]);
export type AdvisoryControl = z.infer<typeof advisoryControlSchema>;
export type ManagementCommand = z.infer<typeof managementCommandSchema>;
export interface AdvisoryItem {
  id: string;
  name: string;
  enabled: boolean;
  autoUpdate: boolean;
  source: "learned" | "recorded";
  sourceRevision: number;
  successfulAt: number;
  stepLabels: string[];
}
export interface ManagedProfile {
  scope: z.infer<typeof scope>;
  name: string;
  origin: string;
  notes: string;
  enabled: boolean;
  autoUpdate: boolean;
  updatedAt: number;
  recipes: AdvisoryItem[];
  truncated: boolean;
  recipeCount: number;
  cursor: string | null;
}
export interface ManagementPage<T> {
  revision: number;
  enabled: boolean;
  items: T[];
  cursor: string | null;
  partial: boolean;
}
export const advisoryItemSchema = z.strictObject({
  id,
  name: z.string().max(200),
  enabled: z.boolean(),
  autoUpdate: z.boolean(),
  source: z.enum(["learned", "recorded"]),
  sourceRevision: revision,
  successfulAt: revision,
  stepLabels: z.array(z.string().max(200)).max(64),
});
export const managedProfileSchema = z.strictObject({
  scope,
  name: z.string().max(80),
  origin: z.string().url().max(2048),
  notes: z.string().max(500),
  enabled: z.boolean(),
  autoUpdate: z.boolean(),
  updatedAt: revision,
  recipes: z.array(advisoryItemSchema).max(20),
  truncated: z.boolean(),
  recipeCount: revision,
  cursor: id.nullable(),
});
export const workflowItemSchema = advisoryItemSchema.extend({
  scope,
  origin: z.string().url().max(2048),
});
export const profilesPageSchema = advisoryCatalogSchema.extend({
  items: z.array(managedProfileSchema).max(20),
  cursor: z.string().max(512).nullable(),
  partial: z.boolean(),
});
export const workflowsPageSchema = advisoryCatalogSchema.extend({
  items: z.array(workflowItemSchema).max(20),
  cursor: z.string().max(512).nullable(),
  partial: z.boolean(),
});
export const profileResultSchema = advisoryCatalogSchema.extend({
  profile: managedProfileSchema,
});
export const historyPageSchema = z.strictObject({
  revision,
  items: z
    .array(
      z.strictObject({
        id,
        source: z.enum(["learned", "recorded"]),
        sourceDigest: z.string().regex(/^[a-f0-9]{64}$/),
        sourceRevision: revision,
        successfulAt: revision,
        stepLabels: z.array(z.string().max(200)).max(64),
      }),
    )
    .max(128),
  cursor: revision.nullable(),
});
