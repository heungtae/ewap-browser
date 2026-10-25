import { z } from "zod";
const profileGuard = z.string().regex(/^[a-f0-9]{64}$/);
const migrationId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const epoch = z.number().int().positive().safe();
export const migrationCommandSchema = z.discriminatedUnion("kind", [
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
