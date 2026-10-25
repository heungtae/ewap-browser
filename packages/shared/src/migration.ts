import { z } from "zod";
export const migrationUnits = [
  "MG01",
  "MG02",
  "MG03",
  "MG04",
  "MG05",
  "MG06",
] as const;
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const label = z.string().min(1).max(256);
export const migrationManifestSchema = z.strictObject({
  migrationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  sourceSchemas: label,
  targetSchemas: label,
  legacyRelease: label,
  targetRelease: label,
  profileGuard: hex.optional(),
  sourceDigests: z.record(z.enum(migrationUnits), hex),
});
export const migrationCheckpointSchema = z
  .strictObject({
    sourceDigest: hex,
    targetDigest: hex,
    copied: z.number().int().nonnegative().safe(),
    quarantined: z.number().int().nonnegative().safe(),
    sourceCount: z.number().int().nonnegative().safe(),
  })
  .refine((value) => value.copied + value.quarantined === value.sourceCount);
export const migrationJournalSchema = z
  .strictObject({
    manifest: migrationManifestSchema,
    revision: z.number().int().nonnegative().safe(),
    epoch: z.number().int().positive().safe(),
    phase: z.enum([
      "prepared",
      "copying",
      "validated",
      "committed",
      "rolled_back",
    ]),
    stores: z.partialRecord(z.enum(migrationUnits), migrationCheckpointSchema),
    acknowledgments: z.strictObject({
      extension: hex.optional(),
      backend: hex.optional(),
    }),
  })
  .refine(
    (value) =>
      !["validated", "committed"].includes(value.phase) ||
      migrationUnits.every((unit) => value.stores[unit] !== undefined),
  );
export const migrationOwnerAckSchema = z.strictObject({
  schema: z.literal("wca.migration-ack/v1"),
  owner: z.enum(["extension", "backend"]),
  migrationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  profileGuard: hex,
  epoch: z.number().int().positive().safe(),
  manifestDigest: hex,
});
export type MigrationOwnerAck = z.infer<typeof migrationOwnerAckSchema>;
