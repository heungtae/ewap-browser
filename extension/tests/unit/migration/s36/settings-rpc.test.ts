import { expect, it } from "vitest";
import { settingsTransport } from "../../../../../apps/chrome-extension/src/migration/settings-rpc.js";
import { parseMigrationCommand } from "../../../../../packages/policy-engine/src/migration-rpc.js";
import { providerSettings } from "./mg01-support.js";
import { migrationDigest } from "../../../../../apps/chrome-extension/src/migration/migration-digest.js";
const profileGuard = "b".repeat(64);
it("does not read or forward credentials without an asserted frozen source", async () => {
  let reads = 0,
    calls = 0;
  const port = settingsTransport(
    profileGuard,
    {
      async assertFrozen() {
        throw new Error("NOT_FROZEN");
      },
      async get() {
        reads++;
        return {};
      },
    },
    async () => {
      calls++;
      return {};
    },
  );
  await expect(
    port.stage("test", 1, "a".repeat(64), "session-only"),
  ).rejects.toThrow("NOT_FROZEN");
  expect(reads).toBe(0);
  expect(calls).toBe(0);
});
it("checks backend mode before reading source credential values", async () => {
  let reads = 0;
  const port = settingsTransport(
    profileGuard,
    {
      async assertFrozen() {},
      async get() {
        reads++;
        return {};
      },
    },
    async () => ({
      schema: "wca.migration-status/v1",
      profileGuard,
      epoch: 1,
      admission: false,
      namespace: "legacy",
      settingsMode: "session-only",
      migration: {
        migrationId: "test",
        epoch: 1,
        phase: "prepared",
        revision: 0,
      },
    }),
  );
  await expect(
    port.stage("test", 1, "a".repeat(64), "os-store"),
  ).rejects.toThrow("MG01_TRANSFER_PREFLIGHT");
  expect(reads).toBe(0);
});
it("rejects unrelated raw fields and oversized snapshots before native forwarding", () => {
  const command = {
    kind: "migration.settings.stage",
    profileGuard,
    migrationId: "test",
    epoch: 1,
    sourceDigest: "a".repeat(64),
    secretMode: "session-only",
    source: providerSettings(),
  };
  expect(() => parseMigrationCommand(command)).not.toThrow();
  expect(() =>
    parseMigrationCommand({
      ...command,
      source: { rawPage: "PRIVATE_CANARY" },
    }),
  ).toThrow();
  const oversized = providerSettings();
  oversized.providers.primary.config.api_key = "x".repeat(200_000);
  expect(() =>
    parseMigrationCommand({ ...command, source: oversized }),
  ).toThrow();
});
it("detects source drift after a backend reply instead of publishing an ACK", async () => {
  let value = providerSettings();
  const digest = migrationDigest({ provider_settings: value });
  const checkpoint = {
    sourceDigest: digest,
    targetDigest: "a".repeat(64),
    copied: 1,
    quarantined: 0,
    sourceCount: 1,
  };
  const port = settingsTransport(
    profileGuard,
    {
      async assertFrozen() {},
      async get() {
        return { provider_settings: value };
      },
    },
    async (command) => {
      if (command.kind === "migration.status")
        return {
          schema: "wca.migration-status/v1",
          profileGuard,
          epoch: 1,
          admission: false,
          namespace: "legacy",
          settingsMode: "session-only",
          migration: {
            migrationId: "test",
            epoch: 1,
            phase: "prepared",
            revision: 0,
          },
        };
      value = providerSettings();
      value.revision++;
      return {
        schema: "wca.mg01-ack/v1",
        profileGuard,
        migrationId: "test",
        epoch: 1,
        secretMode: "session-only",
        checkpoint,
        verified: true,
      };
    },
  );
  await expect(port.stage("test", 1, digest, "session-only")).rejects.toThrow(
    "SOURCE_CHANGED",
  );
});
