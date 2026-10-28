import { expect, it, vi } from "vitest";
import { migrationUnits } from "../../../../../packages/shared/src/migration.js";
import { parseMigrationCommand } from "../../../../../packages/policy-engine/src/migration-rpc.js";
import {
  watchFrozenSource,
  type StorageChanges,
} from "../../../../../apps/chrome-extension/src/migration/source-watch.js";
import { consensusFixture as fixture } from "./consensus-support.js";
it("blocks consensus when a watched source changes even if its value is restored", async () => {
  const f = fixture();
  let listener:
    | ((changes: Record<string, unknown>, area: string) => void)
    | undefined;
  const events: StorageChanges = {
    addListener(value) {
      listener = value;
    },
    removeListener() {
      listener = undefined;
    },
  };
  const watched = watchFrozenSource(
    {
      async get() {
        return {};
      },
      async assertFrozen() {},
    },
    events,
    "local",
    ["provider_settings"],
    1,
  );
  f.browser.assertFrozen = watched.assertFrozen;
  listener?.({ provider_settings: {} }, "local");
  listener?.({ provider_settings: {} }, "local");
  await expect(f.client.validate(f.view)).rejects.toThrow(
    "MIGRATION_SOURCE_CHANGED",
  );
  expect(f.calls()).toHaveLength(0);
  watched.dispose();
});
it("keeps source parsing strict and refuses backend-owned ACKs on the browser channel", async () => {
  const f = fixture();
  await f.client.validate(f.view);
  const command = f.calls()[0]![0];
  for (const patch of [
    { rawSource: "PRIVATE_CANARY" },
    { secretMode: "implicit" },
    { source: { rawPage: "PRIVATE_CANARY" } },
  ])
    expect(() => parseMigrationCommand({ ...command, ...patch })).toThrow();
  expect(() =>
    parseMigrationCommand({
      ...command,
      kind: "migration.consensus.acknowledge",
      ack: {
        schema: "wca.migration-ack/v1",
        owner: "backend",
        profileGuard: f.view.manifest.profileGuard,
        migrationId: "consensus",
        epoch: 1,
        manifestDigest: "a".repeat(64),
      },
    }),
  ).toThrow();
});
it("validates without an owner ACK, then persists and verifies the browser ACK before asking for both-owner agreement", async () => {
  const f = fixture(),
    validated = await f.client.validate(f.view);
  expect(validated.phase).toBe("validated");
  expect(validated.revision).toBe(2);
  expect(validated.acknowledgments).toEqual({});
  expect(f.browser.acknowledge).not.toHaveBeenCalled();
  const agreed = await f.client.acknowledge(validated);
  expect(agreed.revision).toBe(3);
  expect(agreed.acknowledgments.backend).toBe(agreed.acknowledgments.extension);
  expect(f.browser.acknowledge).toHaveBeenCalledWith(validated);
  expect(f.browser.verifyAcknowledgment).toHaveBeenCalledTimes(2);
  expect((await f.client.acknowledge(agreed)).revision).toBe(3);
  expect((await f.client.validate(agreed)).revision).toBe(3);
});
it("freshly rejects drift in each source before consensus dispatch", async () => {
  for (const unit of migrationUnits) {
    const f = fixture();
    f.browser.sourceDigest = vi.fn(async (current) =>
      current === unit ? "c".repeat(64) : f.digest,
    );
    await expect(f.client.validate(f.view)).rejects.toThrow(
      "MIGRATION_CHECKPOINT_READBACK",
    );
    expect(f.calls()).toHaveLength(0);
  }
});
it("does not dispatch acknowledgment when the persisted browser ACK cannot be verified", async () => {
  const f = fixture(),
    validated = await f.client.validate(f.view);
  f.browser.verifyAcknowledgment = vi.fn(async () => false);
  await expect(f.client.acknowledge(validated)).rejects.toThrow("ACK_REQUIRED");
  expect(f.calls()).toHaveLength(1);
});
it("rejects target/freeze loss after a durable response without issuing another consensus command", async () => {
  for (const failure of ["target", "freeze"]) {
    const f = fixture();
    f.replies.after = () => {
      if (failure === "target") f.browser.validate = vi.fn(async () => false);
      else
        f.browser.assertFrozen = vi.fn(async () => {
          throw new Error("SOURCE_NOT_FROZEN");
        });
    };
    await expect(f.client.validate(f.view)).rejects.toThrow();
    expect(f.calls()).toHaveLength(1);
  }
});
it("rejects altered scope, revision, phase, digest and authority-bearing replies", async () => {
  for (const patch of [
    { profileGuard: "c".repeat(64) },
    { migrationId: "other" },
    { epoch: 2 },
    { revision: 1 },
    { manifestDigest: "c".repeat(64) },
    { phase: "committed" },
    { admission: true },
    { acknowledgments: { backend: "c".repeat(64) } },
  ]) {
    const f = fixture();
    f.replies.patch = patch;
    await expect(f.client.validate(f.view)).rejects.toThrow();
  }
});
it("rechecks credentials during both preflight and post-response verification", async () => {
  for (const late of [false, true]) {
    const f = fixture(),
      original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (command) => {
      if (
        command.kind === "migration.settings.validate" &&
        (!late || f.calls().length)
      )
        throw new Error("SECRET_LOST");
      return original(command);
    });
    await expect(f.client.validate(f.view)).rejects.toThrow("SECRET_LOST");
    expect(f.calls()).toHaveLength(late ? 1 : 0);
  }
});
