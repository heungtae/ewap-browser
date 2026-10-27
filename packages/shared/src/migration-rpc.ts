import { z } from "zod";
import { migrationCheckpointSchema, migrationUnits } from "./migration.js";
const profileGuard = z.string().regex(/^[a-f0-9]{64}$/);
const migrationId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const epoch = z.number().int().positive().safe();
export const migrationResumeScopeSchema = z.strictObject({
  profileGuard,
  migrationId,
  epoch,
  revision: z.number().int().nonnegative().safe(),
});
export const migrationResumeCheckSchema = migrationResumeScopeSchema.extend({
  sourceDigests: z.record(z.enum(migrationUnits), profileGuard),
});
export const migrationResumeResultSchema = migrationResumeScopeSchema.extend({
  schema: z.literal("wca.migration-resume-check/v1"),
  phase: z.enum(["prepared", "copying", "validated"]),
  sourceMatched: z.literal(true),
});
export const migrationCheckpointsSchema = z.record(
  z.enum(migrationUnits),
  migrationCheckpointSchema,
);
export const migrationCheckpointResultSchema =
  migrationResumeScopeSchema.extend({
    schema: z.literal("wca.migration-checkpoints/v1"),
    phase: z.literal("copying"),
    manifestDigest: profileGuard,
    stores: migrationCheckpointsSchema,
  });
const settingsScope = {
  profileGuard,
  migrationId,
  epoch,
  sourceDigest: profileGuard,
  secretMode: z.enum(["session-only", "os-store"]),
  source: z.unknown().optional(),
};
export const migrationSettingsAckSchema = z.strictObject({
  schema: z.literal("wca.mg01-ack/v1"),
  profileGuard,
  migrationId,
  epoch,
  secretMode: settingsScope.secretMode,
  checkpoint: migrationCheckpointSchema,
  verified: z.literal(true),
});
export const migrationCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("migration.checkpoints.publish"),
    ...migrationResumeCheckSchema.shape,
    stores: migrationCheckpointsSchema,
  }),
  z.strictObject({
    kind: z.literal("migration.checkpoints.read"),
    ...migrationResumeScopeSchema.shape,
  }),
  migrationResumeCheckSchema.extend({
    kind: z.literal("migration.resume.check"),
  }),
  z.strictObject({
    kind: z.literal("migration.settings.stage"),
    ...settingsScope,
  }),
  z.strictObject({
    kind: z.literal("migration.settings.validate"),
    ...settingsScope,
    checkpoint: migrationCheckpointSchema,
  }),
  z.strictObject({ kind: z.literal("migration.status"), profileGuard }),
  z.strictObject({
    kind: z.literal("migration.policy.put"),
    profileGuard,
    value: z.unknown(),
  }),
  z.strictObject({
    kind: z.literal("migration.policy.read"),
    profileGuard,
    migrationId,
    epoch,
  }),
]);
export type MigrationCommand = z.infer<typeof migrationCommandSchema>;
export const migrationStatusSchema = z.strictObject({
  schema: z.literal("wca.migration-status/v1"),
  profileGuard,
  epoch: z.number().int().nonnegative().safe(),
  admission: z.literal(false),
  settingsMode: z.enum(["session-only", "os-store"]).nullable().optional(),
  namespace: z.enum(["legacy", "target"]),
  migration: z
    .strictObject({
      migrationId,
      epoch,
      revision: z.number().int().nonnegative().safe(),
      phase: z.enum([
        "prepared",
        "copying",
        "validated",
        "committed",
        "rolled_back",
      ]),
    })
    .nullable(),
});
export async function migrationProfileGuard(
  installationId: string,
  profileId: string,
) {
  for (const id of [installationId, profileId])
    if (!id || id.length > 128) throw new Error("MIGRATION_PROFILE");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify(["wca.migration-profile/v1", installationId, profileId]),
    ),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export interface MigrationRequestContext {
  readonly deadline: number;
  readonly signal: AbortSignal;
}
