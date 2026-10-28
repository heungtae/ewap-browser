import { expect, it, vi } from "vitest";
import { resumeObservedOwner } from "../../../../../apps/chrome-extension/src/migration/resume-observed.js";
import { migrationDigest } from "../../../../../apps/chrome-extension/src/migration/migration-digest.js";
import { migrationUnits } from "../../../../../packages/shared/src/migration.js";
import type { StorageChanges } from "../../../../../apps/chrome-extension/src/migration/source-watch.js";
import type { MigrationCommand } from "../../../../../packages/shared/src/migration-rpc.js";
import { consensusFixture } from "./consensus-support.js";
function fixture() {
  const f = consensusFixture(),
    profileGuard = f.view.manifest.profileGuard!,
    digest = migrationDigest({
      manifest: f.view.manifest,
      stores: f.view.stores,
    });
  const listeners = new Set<
    (changes: Record<string, unknown>, area: string) => void
  >();
  const events: StorageChanges = {
    addListener: (fn) => {
      listeners.add(fn);
    },
    removeListener: (fn) => {
      listeners.delete(fn);
    },
  };
  const source = {
    async get() {
      return { provider_settings: { schema_version: 1, providers: {} } };
    },
    async assertFrozen() {},
  };
  const state = {
    revision: 1,
    phase: "copying",
    afterSnapshot: () => {},
    snapshotDigest: digest,
    snapshotPhase: "copying",
    failSettings: false,
  };
  const request = vi.fn(async (command: MigrationCommand): Promise<unknown> => {
    const base = {
      profileGuard,
      migrationId: "consensus",
      epoch: 1,
      revision: state.revision,
    };
    if (command.kind === "migration.status")
      return {
        schema: "wca.migration-status/v1",
        profileGuard,
        epoch: 1,
        admission: false,
        namespace: "legacy",
        settingsMode: "session-only",
        migration: {
          migrationId: base.migrationId,
          epoch: base.epoch,
          revision: base.revision,
          phase: state.phase,
        },
      };
    if (command.kind === "migration.resume.snapshot") {
      state.afterSnapshot();
      return {
        schema: "wca.migration-resume-snapshot/v1",
        ...base,
        phase: state.snapshotPhase,
        manifestDigest: state.snapshotDigest,
      };
    }
    if (command.kind === "migration.resume.check")
      return {
        schema: "wca.migration-resume-check/v1",
        ...base,
        phase: state.phase,
        sourceMatched: true,
      };
    if (command.kind === "migration.settings.validate") {
      if (state.failSettings) throw new Error("SECRET_LOST");
      return {
        schema: "wca.mg01-ack/v1",
        profileGuard,
        migrationId: "consensus",
        epoch: 1,
        secretMode: "session-only",
        checkpoint: f.view.stores.MG01,
        verified: true,
      };
    }
    throw new Error("UNEXPECTED_COMMAND");
  });
  const input = {
    view: structuredClone(f.view),
    owner: f.browser,
    local: source,
    session: source,
    events,
    mode: "session-only" as const,
    request,
  };
  return {
    ...f,
    input,
    state,
    listeners,
    request,
    emit(area: string, key: string) {
      for (const listener of listeners) listener({ [key]: {} }, area);
    },
  };
}
it("rebinds fresh owner/source/target observations without reading or returning historical ACKs", async () => {
  const f = fixture();
  f.input.view.acknowledgments = {
    extension: "c".repeat(64),
    backend: "c".repeat(64),
  };
  const resumed = await resumeObservedOwner(f.input);
  expect(resumed.scope).toEqual({
    migrationId: "consensus",
    epoch: 1,
    revision: 1,
  });
  expect(resumed).not.toHaveProperty("acknowledgments");
  expect(f.browser.acknowledge).not.toHaveBeenCalled();
  expect(f.browser.verifyAcknowledgment).not.toHaveBeenCalled();
  expect(
    f.request.mock.calls.filter(
      ([c]) => c.kind === "migration.resume.snapshot",
    ),
  ).toHaveLength(3);
  expect(
    f.request.mock.calls.every(([c]) => !c.kind.includes("acknowledge")),
  ).toBe(true);
  resumed.dispose();
  expect(f.listeners.size).toBe(0);
});
it("rejects each lost source and removes both listeners without mutating the journal", async () => {
  for (const unit of migrationUnits) {
    const f = fixture();
    f.browser.sourceDigest = vi.fn(async (current) =>
      current === unit ? "0".repeat(64) : f.digest,
    );
    // Server preflight and local target check are independent; emulate backend matching only at the snapshot.
    await expect(resumeObservedOwner(f.input)).rejects.toThrow();
    expect(f.listeners.size).toBe(0);
    expect(f.browser.acknowledge).not.toHaveBeenCalled();
  }
});
it("rejects lost target or credential and cleans up observation", async () => {
  for (const failure of ["target", "settings"]) {
    const f = fixture();
    if (failure === "target") f.browser.validate = vi.fn(async () => false);
    else f.state.failSettings = true;
    await expect(resumeObservedOwner(f.input)).rejects.toThrow();
    expect(f.listeners.size).toBe(0);
  }
});
it("rejects a target lost after the first complete readback", async () => {
  const f = fixture();
  let checks = 0;
  f.browser.validate = vi.fn(async () => ++checks <= 5);
  await expect(resumeObservedOwner(f.input)).rejects.toThrow(
    "MIGRATION_CHECKPOINT_READBACK",
  );
  expect(f.listeners.size).toBe(0);
});
it("rejects revision, digest, phase and watched-source races", async () => {
  for (const failure of ["revision", "digest", "phase", "event"]) {
    const f = fixture();
    if (failure === "digest") f.state.snapshotDigest = "0".repeat(64);
    if (failure === "phase") f.state.snapshotPhase = "validated";
    if (failure === "event")
      f.state.afterSnapshot = () => f.emit("session", "chat_session_v1");
    if (failure === "revision")
      f.state.afterSnapshot = () => {
        f.state.revision = 2;
      };
    await expect(resumeObservedOwner(f.input)).rejects.toThrow();
    expect(f.listeners.size).toBe(0);
  }
});
it("rejects a watched-source change during the final backend snapshot", async () => {
  const f = fixture();
  let snapshots = 0;
  f.state.afterSnapshot = () => {
    if (++snapshots === 3) f.emit("local", "provider_settings");
  };
  await expect(resumeObservedOwner(f.input)).rejects.toThrow(
    "MIGRATION_SOURCE_CHANGED",
  );
  expect(f.listeners.size).toBe(0);
});
