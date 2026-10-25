import { z } from "zod";
export const legacyCapabilities = [
  "navigate",
  "page_api",
  "page_api_read",
  "page_method",
  "click",
  "type",
  "network_write",
  "download",
  "upload",
  "schedule",
  "collection_read",
] as const;
export const migratedCategories = [
  "action_execution",
  "plan_approval",
  "tool_permission",
  "risk_confirmation",
  "source_disclosure",
  "runtime_data_disclosure",
  "vision_disclosure",
  "scroll_read",
] as const;
export const permissionKeys = [
  "contextpilot_permissions",
  "wb_permissions",
] as const;
export const mg02SourceKeys = [...permissionKeys, "agent_preferences"] as const;
export const migrationHost = z
  .string()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
  )
  .refine(
    (host) => !/^\d+(?:\.\d+){3}$/.test(host) && !host.endsWith(".localhost"),
  );
const index = z.number().int().min(-1).safe();
const revision = z.number().int().nonnegative().safe();
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const migratedPreferencesSchema = z.strictObject({
  policyRevision: revision.min(1),
  mode: z.literal("custom"),
  categories: z.record(z.enum(migratedCategories), z.enum(["ask", "deny"])),
  toolScope: z.enum(["request", "approved_plan"]),
  defaultReadScope: z.enum(["all_dom", "visible_only", "interactive"]),
  screenshotPolicy: z.enum(["manual_only", "disabled"]),
  pageMethodEnabled: z.boolean(),
  groupToolsInTimeline: z.boolean(),
  showToolDebugDetails: z.boolean(),
});
const permission = z
  .strictObject({
    kind: z.literal("permission"),
    sourceKey: z.enum(permissionKeys),
    sourceIndex: index.min(0),
    capability: z.enum(legacyCapabilities),
    host: migrationHost,
    originalAction: z.enum(["allow", "deny"]),
    decision: z.enum(["ask", "deny"]),
    activeSource: z.boolean(),
    reusableGrant: z.literal(false),
  })
  .refine(
    (row) => row.decision === (row.originalAction === "deny" ? "deny" : "ask"),
  );
export const mg02PolicySchema = z
  .strictObject({
    schema: z.literal("wca.mg02-policy/v1"),
    blocked: z.boolean(),
    preferences: migratedPreferencesSchema,
    records: z
      .array(
        z.union([
          permission,
          z.strictObject({
            kind: z.literal("preferences"),
            sourceKey: z.literal("agent_preferences"),
            sourceIndex: z.literal(0),
            sourceRevision: revision,
          }),
        ]),
      )
      .max(2049),
    quarantine: z
      .array(
        z.strictObject({
          sourceKey: z.enum(mg02SourceKeys),
          sourceIndex: index,
          reason: z.enum([
            "INVALID_CONTAINER",
            "INVALID_PERMISSION",
            "INVALID_PREFERENCES",
          ]),
          blocks: z.boolean(),
        }),
      )
      .max(2049),
    sourceCount: revision.max(2049),
  })
  .refine(
    (value) =>
      value.records.length + value.quarantine.length === value.sourceCount &&
      (!value.quarantine.some((row) => row.blocks) || value.blocked),
  );
export type MigratedPolicy = z.infer<typeof mg02PolicySchema>;
export const mg02MirrorSchema = z
  .strictObject({
    schema: z.literal("wca.mg02-mirror/v1"),
    migrationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    profileGuard: hex,
    epoch: revision.min(1),
    policyRevision: revision.min(1),
    conversion: mg02PolicySchema,
    checkpoint: z.strictObject({
      sourceDigest: hex,
      targetDigest: hex,
      sourceCount: revision,
      copied: revision,
      quarantined: revision,
    }),
  })
  .refine(
    (value) =>
      value.policyRevision === value.conversion.preferences.policyRevision &&
      value.checkpoint.sourceCount === value.conversion.sourceCount &&
      value.checkpoint.copied === value.conversion.records.length &&
      value.checkpoint.quarantined === value.conversion.quarantine.length,
  );
export type PolicyMirror = z.infer<typeof mg02MirrorSchema>;
export const mg02AckSchema = z.strictObject({
  schema: z.literal("wca.mg02-ack/v1"),
  migrationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  profileGuard: hex,
  epoch: revision.min(1),
  policyRevision: revision.min(1),
  manifestDigest: hex,
});
export type PolicyMirrorAck = z.infer<typeof mg02AckSchema>;
export interface PolicyMirrorPort {
  put(value: PolicyMirror): Promise<PolicyMirrorAck>;
  read(
    profileGuard: string,
    migrationId: string,
    epoch: number,
  ): Promise<PolicyMirrorAck | undefined>;
}
