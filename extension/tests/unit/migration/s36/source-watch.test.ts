import { expect, it } from "vitest";
import {
  watchFrozenSource,
  type StorageChanges,
} from "../../../../../apps/chrome-extension/src/migration/source-watch.js";
function fixture() {
  const listeners = new Set<
    (changes: Record<string, unknown>, area: string) => void
  >();
  const events: StorageChanges = {
    addListener: (f) => {
      listeners.add(f);
    },
    removeListener: (f) => {
      listeners.delete(f);
    },
  };
  let blocked = false;
  const source = {
    async assertFrozen() {
      if (blocked) throw new Error("FENCE_REVOKED");
    },
    async get() {
      return { watched: "value" };
    },
  };
  return {
    events,
    source,
    listeners,
    emit(area: string, key: string) {
      for (const f of listeners) f({ [key]: {} }, area);
    },
    revoke() {
      blocked = true;
    },
  };
}
it("invalidates irreversibly on watched changes, including a later revert", async () => {
  const f = fixture(),
    watched = watchFrozenSource(f.source, f.events, "local", ["watched"], 4);
  f.emit("session", "watched");
  f.emit("local", "unrelated");
  expect(await watched.get(["watched"])).toEqual({ watched: "value" });
  f.emit("local", "watched");
  f.emit("local", "watched");
  await expect(watched.assertFrozen(4)).rejects.toThrow(
    "MIGRATION_SOURCE_CHANGED",
  );
  await expect(watched.get(["watched"])).rejects.toThrow(
    "MIGRATION_SOURCE_CHANGED",
  );
  watched.dispose();
  expect(f.listeners.size).toBe(0);
});
it("rejects epoch/scope changes, upstream revocation and disposal", async () => {
  const f = fixture(),
    watched = watchFrozenSource(f.source, f.events, "session", ["watched"], 1);
  await expect(watched.assertFrozen(2)).rejects.toThrow(
    "MIGRATION_WATCH_EPOCH",
  );
  await expect(watched.get(["untracked"])).rejects.toThrow(
    "MIGRATION_WATCH_SCOPE",
  );
  f.revoke();
  await expect(watched.get(["watched"])).rejects.toThrow("FENCE_REVOKED");
  watched.dispose();
  watched.dispose();
  await expect(watched.assertFrozen(1)).rejects.toThrow(
    "MIGRATION_SOURCE_CHANGED",
  );
  expect(f.listeners.size).toBe(0);
});
it("detects a watched write during an asynchronous source read", async () => {
  const f = fixture();
  const watched = watchFrozenSource(
    {
      ...f.source,
      async get() {
        f.emit("local", "watched");
        return {};
      },
    },
    f.events,
    "local",
    ["watched"],
    1,
  );
  await expect(watched.get(["watched"])).rejects.toThrow(
    "MIGRATION_SOURCE_CHANGED",
  );
  watched.dispose();
});
it("rejects empty or invalid monitoring scopes before registering a listener", () => {
  const f = fixture();
  expect(() => watchFrozenSource(f.source, f.events, "local", [], 1)).toThrow(
    "MIGRATION_WATCH_SCOPE",
  );
  expect(() => watchFrozenSource(f.source, f.events, "local", [""], 1)).toThrow(
    "MIGRATION_WATCH_SCOPE",
  );
  expect(() =>
    watchFrozenSource(f.source, f.events, "local", ["watched"], 0),
  ).toThrow("MIGRATION_WATCH_SCOPE");
  expect(f.listeners.size).toBe(0);
});
