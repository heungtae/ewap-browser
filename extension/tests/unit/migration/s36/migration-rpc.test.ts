import { expect, it } from "vitest";
import {
  migrationProfileGuard,
  migrationStatusSchema,
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
