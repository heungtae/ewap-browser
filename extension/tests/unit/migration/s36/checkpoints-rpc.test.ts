import { expect, it, vi } from "vitest";
import { checkpointTransport } from "../../../../../apps/chrome-extension/src/migration/checkpoints-rpc.js";
import { migrationDigest } from "../../../../../apps/chrome-extension/src/migration/migration-digest.js";
import { migrationUnits } from "../../../../../packages/shared/src/migration.js";
import { parseMigrationCommand } from "../../../../../packages/policy-engine/src/migration-rpc.js";
import type { BrowserMigrationPort } from "../../../../../packages/shared/src/migration-ports.js";
import type {
  Journal,
  Checkpoint,
} from "../../../../../packages/shared/src/migration-types.js";
function fixture() {
  const profile = "a".repeat(64),
    digest = "b".repeat(64);
  const checkpoint: Checkpoint = {
    sourceDigest: digest,
    targetDigest: digest,
    copied: 1,
    quarantined: 0,
    sourceCount: 1,
  };
  const view: Journal = {
    manifest: {
      migrationId: "publish",
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
    revision: 7,
    phase: "validated",
    acknowledgments: {},
    stores: Object.fromEntries(
      migrationUnits.map((unit) => [unit, { ...checkpoint }]),
    ),
  };
  const response = {
    schema: "wca.migration-checkpoints/v1",
    profileGuard: profile,
    migrationId: "publish",
    epoch: 1,
    revision: 1,
    phase: "copying",
    stores: structuredClone(view.stores),
    manifestDigest: migrationDigest({
      manifest: view.manifest,
      stores: view.stores,
    }),
  };
  const browser: BrowserMigrationPort = {
    profileGuard: profile,
    assertFrozen: vi.fn(async () => {}),
    sourceDigest: vi.fn(async () => digest),
    validate: vi.fn(async () => true),
    async freezeAndDrain() {
      throw new Error("UNEXPECTED_FREEZE");
    },
    async stage() {
      throw new Error("UNEXPECTED_STAGE");
    },
    async acknowledge() {
      throw new Error("UNEXPECTED_ACK");
    },
    async verifyAcknowledgment() {
      throw new Error("UNEXPECTED_ACK");
    },
  };
  const request = vi.fn(async (_command: unknown) => structuredClone(response));
  const settings = vi.fn(async () => true);
  const rpc = checkpointTransport(profile, request, browser, settings);
  return { profile, digest, view, response, browser, request, settings, rpc };
}
it("publishes only checked metadata and revalidates every source/target after reply", async () => {
  const f = fixture();
  expect(await f.rpc.publish(f.view, 0)).toEqual(f.response);
  expect(f.browser.sourceDigest).toHaveBeenCalledTimes(12);
  expect(f.browser.validate).toHaveBeenCalledTimes(10);
  expect(f.settings).toHaveBeenCalledTimes(2);
  expect(f.request.mock.calls[0]![0]).toEqual({
    kind: "migration.checkpoints.publish",
    profileGuard: f.profile,
    migrationId: "publish",
    epoch: 1,
    revision: 0,
    sourceDigests: f.view.manifest.sourceDigests,
    stores: f.view.stores,
  });
});
it("reads backend checkpoints and validates them against the pinned manifest and current stores", async () => {
  const f = fixture();
  expect(
    await f.rpc.read(f.view.manifest, {
      migrationId: "publish",
      epoch: 1,
      revision: 1,
    }),
  ).toEqual(f.response);
  expect(f.browser.sourceDigest).toHaveBeenCalledTimes(6);
  f.response.revision = 2;
  await expect(
    f.rpc.read(f.view.manifest, {
      migrationId: "publish",
      epoch: 1,
      revision: 1,
    }),
  ).rejects.toThrow("MIGRATION_CHECKPOINT_SCOPE");
});
it("blocks drift in any source before publication", async () => {
  for (const unit of migrationUnits) {
    const f = fixture();
    f.browser.sourceDigest = vi.fn(async (current) =>
      current === unit ? "c".repeat(64) : f.digest,
    );
    await expect(f.rpc.publish(f.view, 0)).rejects.toThrow(
      "MIGRATION_CHECKPOINT_READBACK",
    );
    expect(f.request).not.toHaveBeenCalled();
  }
});
it("blocks missing credentials, staging loss and freeze loss before publication", async () => {
  for (const failure of ["settings", "target", "freeze"]) {
    const f = fixture();
    if (failure === "settings") f.settings.mockResolvedValue(false);
    if (failure === "target") f.browser.validate = vi.fn(async () => false);
    if (failure === "freeze")
      f.browser.assertFrozen = vi.fn(async () => {
        throw new Error("SOURCE_NOT_FROZEN");
      });
    await expect(f.rpc.publish(f.view, 0)).rejects.toThrow();
    expect(f.request).not.toHaveBeenCalled();
  }
});
it("rejects changed source or target after durable publication without issuing another write", async () => {
  for (const failure of ["source", "target", "settings", "freeze"]) {
    const f = fixture();
    f.request.mockImplementation(async () => {
      if (failure === "source")
        f.browser.sourceDigest = vi.fn(async () => "c".repeat(64));
      if (failure === "target") f.browser.validate = vi.fn(async () => false);
      if (failure === "settings") f.settings.mockResolvedValue(false);
      if (failure === "freeze")
        f.browser.assertFrozen = vi.fn(async () => {
          throw new Error("SOURCE_NOT_FROZEN");
        });
      return f.response;
    });
    await expect(f.rpc.publish(f.view, 0)).rejects.toThrow();
    expect(f.request).toHaveBeenCalledTimes(1);
  }
});
it("rejects mismatched scopes, digests and authority-bearing responses", async () => {
  for (const patch of [
    { profileGuard: "c".repeat(64) },
    { migrationId: "other" },
    { epoch: 2 },
    { revision: 3 },
    { manifestDigest: "c".repeat(64) },
    { phase: "validated" },
    { admission: true },
  ]) {
    const f = fixture();
    Object.assign(f.response, patch);
    await expect(f.rpc.publish(f.view, 0)).rejects.toThrow();
  }
});
it("requires all six strict checkpoints and rejects raw fields before dispatch", () => {
  const f = fixture(),
    value = {
      kind: "migration.checkpoints.publish",
      profileGuard: f.profile,
      migrationId: "publish",
      epoch: 1,
      revision: 0,
      sourceDigests: f.view.manifest.sourceDigests,
      stores: f.view.stores,
    };
  expect(parseMigrationCommand(value).kind).toBe(value.kind);
  for (const unit of migrationUnits) {
    const stores = { ...f.view.stores };
    delete stores[unit];
    expect(() => parseMigrationCommand({ ...value, stores })).toThrow();
  }
  expect(() =>
    parseMigrationCommand({ ...value, rawSource: "PRIVATE_CANARY" }),
  ).toThrow();
});
it("allows idempotent same-revision readback but never treats it as validation or an owner ACK", async () => {
  const f = fixture();
  f.response.revision = 0;
  expect((await f.rpc.publish(f.view, 0)).phase).toBe("copying");
  f.view.acknowledgments.extension = "b".repeat(64);
  await expect(f.rpc.publish(f.view, 0)).rejects.toThrow(
    "MIGRATION_CHECKPOINT_SCOPE",
  );
});
