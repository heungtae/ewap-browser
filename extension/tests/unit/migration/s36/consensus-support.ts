import { vi } from "vitest";
import { consensusTransport } from "../../../../../apps/chrome-extension/src/migration/consensus-rpc.js";
import { migrationDigest } from "../../../../../apps/chrome-extension/src/migration/migration-digest.js";
import { migrationUnits } from "../../../../../packages/shared/src/migration.js";
import type { MigrationCommand } from "../../../../../packages/shared/src/migration-rpc.js";
import type { Journal } from "../../../../../packages/shared/src/migration-types.js";
import type { BrowserMigrationPort } from "../../../../../packages/shared/src/migration-ports.js";
export function consensusFixture() {
  const profile = "a".repeat(64),
    source = { schema_version: 1, providers: {} };
  const digest = migrationDigest({ provider_settings: source });
  const cp = {
    sourceDigest: digest,
    targetDigest: digest,
    copied: 0,
    quarantined: 0,
    sourceCount: 0,
  };
  const view: Journal = {
    manifest: {
      migrationId: "consensus",
      profileGuard: profile,
      sourceSchemas: "source",
      targetSchemas: "target",
      legacyRelease: "legacy",
      targetRelease: "target",
      sourceDigests: Object.fromEntries(
        migrationUnits.map((unit) => [unit, digest]),
      ) as Journal["manifest"]["sourceDigests"],
    },
    epoch: 1,
    revision: 1,
    phase: "copying",
    stores: Object.fromEntries(migrationUnits.map((unit) => [unit, { ...cp }])),
    acknowledgments: {},
  };
  const hash = migrationDigest({
    manifest: view.manifest,
    stores: view.stores,
  });
  const browser: BrowserMigrationPort = {
    profileGuard: profile,
    assertFrozen: vi.fn(async () => {}),
    sourceDigest: vi.fn(async () => digest),
    validate: vi.fn(async () => true),
    acknowledge: vi.fn(async () => ({
      schema: "wca.migration-ack/v1" as const,
      owner: "extension" as const,
      profileGuard: profile,
      migrationId: "consensus",
      epoch: 1,
      manifestDigest: hash,
    })),
    verifyAcknowledgment: vi.fn(async () => true),
    async freezeAndDrain() {
      throw new Error("UNEXPECTED_FREEZE");
    },
    async stage() {
      throw new Error("UNEXPECTED_STAGE");
    },
  };
  let revision = 1,
    validated = false;
  let acknowledgments: Journal["acknowledgments"] = {};
  const replies = { patch: {} as Record<string, unknown>, after: () => {} };
  const request = vi.fn(async (command: MigrationCommand): Promise<unknown> => {
    if (command.kind === "migration.status")
      return {
        schema: "wca.migration-status/v1",
        profileGuard: profile,
        epoch: 1,
        admission: false,
        namespace: "legacy",
        settingsMode: "session-only",
        migration: {
          migrationId: "consensus",
          epoch: 1,
          revision,
          phase: validated ? "validated" : "copying",
        },
      };
    if (command.kind === "migration.settings.validate")
      return {
        schema: "wca.mg01-ack/v1",
        profileGuard: profile,
        migrationId: "consensus",
        epoch: 1,
        secretMode: "session-only",
        checkpoint: cp,
        verified: true,
      };
    if (command.kind === "migration.consensus.validate" && !validated) {
      validated = true;
      revision++;
    }
    if (
      command.kind === "migration.consensus.acknowledge" &&
      !acknowledgments.backend
    ) {
      acknowledgments = { extension: hash, backend: hash };
      revision++;
    }
    replies.after();
    return {
      schema: "wca.migration-consensus/v1",
      profileGuard: profile,
      migrationId: "consensus",
      epoch: 1,
      revision,
      phase: "validated",
      manifestDigest: hash,
      stores: view.stores,
      acknowledgments,
      ...replies.patch,
    };
  });
  const local = {
    async get() {
      return { provider_settings: source };
    },
    async assertFrozen() {},
  };
  const client = consensusTransport(
    profile,
    request,
    browser,
    local,
    "session-only",
  );
  const calls = () =>
    request.mock.calls.filter(([command]) =>
      command.kind.startsWith("migration.consensus."),
    );
  return { view, browser, request, client, replies, calls, digest };
}
