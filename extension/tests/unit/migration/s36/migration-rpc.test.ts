import { expect, it } from "vitest";
import {
  migrationProfileGuard,
  migrationStatusSchema,
  migrationResumeCheckSchema,
} from "../../../../../packages/shared/src/migration-rpc.js";
import { parseMigrationCommand } from "../../../../../packages/policy-engine/src/migration-rpc.js";
import { migrationTransport } from "../../../../../apps/chrome-extension/src/migration/rpc.js";
import { convertMg02 } from "../../../../../apps/chrome-extension/src/migration/mg02-convert.js";
import { migrationDigest } from "../../../../../apps/chrome-extension/src/migration/migration-digest.js";
import { policySource } from "./mg02-support.js";
it("binds the profile to both authenticated installation and profile IDs", async () => {
  const first = await migrationProfileGuard("install", "profile");
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(await migrationProfileGuard("install", "profile")).toBe(first);
  expect(await migrationProfileGuard("other", "profile")).not.toBe(first);
  expect(await migrationProfileGuard("install", "other")).not.toBe(first);
});
const units = ["MG01", "MG02", "MG03", "MG04", "MG05", "MG06"] as const;
const resumeScope = {
  profileGuard: "a".repeat(64),
  migrationId: "resume",
  epoch: 1,
  revision: 2,
};
const resumeResult = {
  ...resumeScope,
  schema: "wca.migration-resume-check/v1",
  phase: "validated",
  sourceMatched: true,
};
it("requires exactly six bounded digests and rejects raw sources", () => {
  const value = {
    ...resumeScope,
    sourceDigests: Object.fromEntries(
      units.map((unit) => [unit, "b".repeat(64)]),
    ),
  };
  expect(migrationResumeCheckSchema.safeParse(value).success).toBe(true);
  for (const unit of units) {
    const digests = { ...value.sourceDigests };
    delete digests[unit];
    expect(
      migrationResumeCheckSchema.safeParse({ ...value, sourceDigests: digests })
        .success,
    ).toBe(false);
  }
  expect(
    migrationResumeCheckSchema.safeParse({ ...value, source: "PRIVATE_CANARY" })
      .success,
  ).toBe(false);
});
it("freshly observes all sources before and after the authenticated check", async () => {
  const reads: string[] = [];
  let calls = 0;
  const rpc = migrationTransport(resumeScope.profileGuard, async (command) => {
    calls++;
    expect(command.kind).toBe("migration.resume.check");
    expect(reads).toEqual([...units]);
    return resumeResult;
  });
  const result = await rpc.checkResume(resumeScope, {
    profileGuard: resumeScope.profileGuard,
    async assertFrozen() {},
    async sourceDigest(unit) {
      reads.push(unit);
      return "b".repeat(64);
    },
  });
  expect(result).toEqual(resumeResult);
  expect(reads).toEqual([...units, ...units]);
  expect(calls).toBe(1);
});
it("rejects source drift or freeze loss while the backend check is in flight", async () => {
  for (const race of ["source", "freeze"]) {
    let replied = false;
    const rpc = migrationTransport(resumeScope.profileGuard, async () => {
      replied = true;
      return resumeResult;
    });
    await expect(
      rpc.checkResume(resumeScope, {
        profileGuard: resumeScope.profileGuard,
        async assertFrozen() {
          if (replied && race === "freeze")
            throw new Error("SOURCE_NOT_FROZEN");
        },
        async sourceDigest(unit) {
          return (replied && unit === "MG04" ? "c" : "b").repeat(64);
        },
      }),
    ).rejects.toThrow(
      race === "source" ? "SOURCE_CHANGED" : "SOURCE_NOT_FROZEN",
    );
  }
});
it("rejects a mismatched or authority-bearing resume response", async () => {
  for (const patch of [
    { profileGuard: "c".repeat(64) },
    { migrationId: "other" },
    { epoch: 2 },
    { revision: 3 },
    { phase: "committed" },
    { admission: true },
  ]) {
    const rpc = migrationTransport(resumeScope.profileGuard, async () => ({
      ...resumeResult,
      ...patch,
    }));
    await expect(
      rpc.checkResume(resumeScope, {
        profileGuard: resumeScope.profileGuard,
        async assertFrozen() {},
        async sourceDigest() {
          return "b".repeat(64);
        },
      }),
    ).rejects.toThrow();
  }
});
it("rejects raw source and remote authority commands before forwarding", () => {
  const profileGuard = "a".repeat(64);
  for (const kind of [
    "migration.prepare",
    "migration.fence",
    "migration.commit",
    "migration.activate",
  ])
    expect(() => parseMigrationCommand({ kind, profileGuard })).toThrow();
  expect(() =>
    parseMigrationCommand({
      kind: "migration.policy.put",
      profileGuard,
      value: { rawPage: "PRIVATE_CANARY" },
    }),
  ).toThrow();
});
it("does not publish an ACK with an incorrect mirror digest", async () => {
  const profileGuard = "a".repeat(64),
    conversion = convertMg02(policySource());
  const value = {
    schema: "wca.mg02-mirror/v1" as const,
    migrationId: "test",
    profileGuard,
    epoch: 1,
    policyRevision: conversion.preferences.policyRevision,
    conversion,
    checkpoint: {
      sourceDigest: "a".repeat(64),
      targetDigest: migrationDigest(conversion),
      copied: conversion.records.length,
      quarantined: conversion.quarantine.length,
      sourceCount: conversion.sourceCount,
    },
  };
  const rpc = migrationTransport(profileGuard, async () => ({
    schema: "wca.mg02-ack/v1",
    migrationId: "test",
    profileGuard,
    epoch: 1,
    policyRevision: value.policyRevision,
    manifestDigest: "0".repeat(64),
  }));
  await expect(rpc.port.put(value)).rejects.toThrow("MIGRATION_ACK_MISMATCH");
});
it("keeps status summaries strict and always closed-admission", () => {
  const value = {
    schema: "wca.migration-status/v1",
    profileGuard: "a".repeat(64),
    epoch: 0,
    admission: false,
    namespace: "legacy",
    migration: null,
  };
  expect(migrationStatusSchema.safeParse(value).success).toBe(true);
  for (const patch of [
    { admission: true },
    { secret: "PRIVATE_CANARY" },
    { source: {} },
  ])
    expect(
      migrationStatusSchema.safeParse({ ...value, ...patch }).success,
    ).toBe(false);
});
