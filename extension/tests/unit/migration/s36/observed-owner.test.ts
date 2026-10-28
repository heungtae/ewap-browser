import { expect, it, vi } from "vitest";
import { observeMigrationOwner } from "../../../../../apps/chrome-extension/src/migration/observed-owner.js";
import type { StorageChanges } from "../../../../../apps/chrome-extension/src/migration/source-watch.js";
import { consensusFixture } from "./consensus-support.js";
function fixture() {
  const f = consensusFixture();
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
      return {};
    },
    async assertFrozen() {},
  };
  const emit = (area: string, key: string) => {
    for (const fn of listeners) fn({ [key]: {} }, area);
  };
  return { ...f, source, events, listeners, emit };
}
it("tracks all legacy local/session source keys and rejects changes before owner or ACK calls", async () => {
  for (const [area, key] of [
    ["local", "provider_settings"],
    ["local", "contextpilot_permissions"],
    ["local", "wb_permissions"],
    ["local", "agent_preferences"],
    ["local", "saved_workflows_v1"],
    ["local", "learned_page_profiles_v1"],
    ["session", "chat_session_v1"],
    ["session", "execution_requests_v1"],
    ["session", "contextpilot_pending_workflow_selections_v1"],
    ["session", "execution_diagnostics_v1"],
  ]) {
    const f = fixture(),
      observed = await observeMigrationOwner(
        f.browser,
        f.source,
        f.source,
        f.events,
        1,
      );
    f.emit(area!, key!);
    f.emit(area!, key!);
    await expect(
      observed.owner.acknowledge({ ...f.view, phase: "validated" }),
    ).rejects.toThrow("MIGRATION_SOURCE_CHANGED");
    expect(f.browser.acknowledge).not.toHaveBeenCalled();
    observed.dispose();
    expect(f.listeners.size).toBe(0);
  }
});
it("invalidates a result if a source event arrives during an asynchronous owner action", async () => {
  const f = fixture(),
    observed = await observeMigrationOwner(
      f.browser,
      f.source,
      f.source,
      f.events,
      1,
    );
  f.browser.sourceDigest = vi.fn(async () => {
    f.emit("session", "chat_session_v1");
    return f.digest;
  });
  await expect(observed.owner.sourceDigest("MG01", 1)).rejects.toThrow(
    "MIGRATION_SOURCE_CHANGED",
  );
  await expect(
    observed.owner.verifyAcknowledgment({ ...f.view, phase: "validated" }),
  ).rejects.toThrow("MIGRATION_SOURCE_CHANGED");
  observed.dispose();
});
it("never returns a newly persisted browser ACK if a watched source changes during acknowledgment", async () => {
  const f = fixture(),
    observed = await observeMigrationOwner(
      f.browser,
      f.source,
      f.source,
      f.events,
      1,
    );
  const original = f.browser.acknowledge.bind(f.browser);
  f.browser.acknowledge = vi.fn(async (view) => {
    const ack = await original(view);
    f.emit("local", "provider_settings");
    return ack;
  });
  await expect(
    observed.owner.acknowledge({ ...f.view, phase: "validated" }),
  ).rejects.toThrow("MIGRATION_SOURCE_CHANGED");
  expect(f.browser.acknowledge).toHaveBeenCalledTimes(1);
  observed.dispose();
});
it("ignores unrelated changes, enforces epoch and disposes both listeners after failure", async () => {
  const f = fixture(),
    observed = await observeMigrationOwner(
      f.browser,
      f.source,
      f.source,
      f.events,
      1,
    );
  f.emit("local", "unrelated");
  f.emit("sync", "provider_settings");
  expect(await observed.owner.sourceDigest("MG01", 1)).toBe(f.digest);
  await expect(observed.owner.assertFrozen(2)).rejects.toThrow(
    "MIGRATION_WATCH_EPOCH",
  );
  await expect(observed.local.get(["untracked"])).rejects.toThrow(
    "MIGRATION_WATCH_SCOPE",
  );
  observed.dispose();
  expect(f.listeners.size).toBe(0);
  await expect(observed.owner.assertFrozen(1)).rejects.toThrow(
    "MIGRATION_SOURCE_CHANGED",
  );
  f.browser.assertFrozen = vi.fn(async () => {
    throw new Error("SOURCE_NOT_FROZEN");
  });
  await expect(
    observeMigrationOwner(f.browser, f.source, f.source, f.events, 1),
  ).rejects.toThrow("SOURCE_NOT_FROZEN");
  expect(f.listeners.size).toBe(0);
});
it("removes the first listener if registering the second storage watcher fails", async () => {
  const f = fixture();
  let registrations = 0;
  const events: StorageChanges = {
    addListener(fn) {
      if (++registrations === 2) throw new Error("LISTENER_UNAVAILABLE");
      f.events.addListener(fn);
    },
    removeListener: f.events.removeListener,
  };
  await expect(
    observeMigrationOwner(f.browser, f.source, f.source, events, 1),
  ).rejects.toThrow("LISTENER_UNAVAILABLE");
  expect(f.listeners.size).toBe(0);
});
