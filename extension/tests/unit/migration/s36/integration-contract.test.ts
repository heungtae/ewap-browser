import { describe, expect, it } from "vitest";
import {
  migrationCheckpointSchema,
  migrationJournalSchema,
  migrationManifestSchema,
  migrationOwnerAckSchema,
  migrationUnits,
} from "../../../../../packages/shared/src/migration.js";
const hex = "a".repeat(64);
const manifest = {
  migrationId: "joint",
  sourceSchemas: "legacy",
  targetSchemas: "target",
  legacyRelease: "0.1.117",
  targetRelease: "fixture",
  profileGuard: hex,
  sourceDigests: Object.fromEntries(migrationUnits.map((unit) => [unit, hex])),
};
const checkpoint = {
  sourceDigest: hex,
  targetDigest: hex,
  copied: 1,
  quarantined: 0,
  sourceCount: 1,
};
describe("six-unit migration boundary contracts", () => {
  it("requires exactly all six source digests", () => {
    expect(migrationManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      migrationManifestSchema.safeParse({
        ...manifest,
        sourceDigests: { MG01: hex },
      }).success,
    ).toBe(false);
    expect(
      migrationManifestSchema.safeParse({
        ...manifest,
        sourceDigests: { ...manifest.sourceDigests, MG07: hex },
      }).success,
    ).toBe(false);
  });
  it("rejects unsafe checkpoint counts and count mismatches", () => {
    for (const patch of [
      { copied: -1 },
      { sourceCount: 2 },
      { quarantined: Number.MAX_SAFE_INTEGER + 1 },
    ])
      expect(
        migrationCheckpointSchema.safeParse({ ...checkpoint, ...patch })
          .success,
      ).toBe(false);
  });
  it("requires every checkpoint before validated or committed phase", () => {
    const view = {
      manifest,
      revision: 1,
      epoch: 1,
      phase: "validated",
      stores: { MG01: checkpoint },
      acknowledgments: {},
    };
    expect(migrationJournalSchema.safeParse(view).success).toBe(false);
    expect(
      migrationJournalSchema.safeParse({
        ...view,
        stores: Object.fromEntries(
          migrationUnits.map((unit) => [unit, checkpoint]),
        ),
      }).success,
    ).toBe(true);
    expect(
      migrationJournalSchema.safeParse({ ...view, phase: "copying" }).success,
    ).toBe(true);
  });
  it("rejects unbound, extra-field or malformed acknowledgment payloads", () => {
    const ack = {
      schema: "wca.migration-ack/v1",
      owner: "extension",
      migrationId: "joint",
      profileGuard: hex,
      epoch: 1,
      manifestDigest: hex,
    };
    expect(migrationOwnerAckSchema.safeParse(ack).success).toBe(true);
    for (const patch of [
      { profileGuard: undefined },
      { epoch: 0 },
      { owner: "other" },
      { credential: "secret" },
    ])
      expect(
        migrationOwnerAckSchema.safeParse({ ...ack, ...patch }).success,
      ).toBe(false);
  });
});
