import {
  watchFrozenSource,
  type StorageChanges,
} from "../../../../apps/chrome-extension/src/migration/source-watch.js";
const storage = (
  globalThis as unknown as {
    chrome: {
      storage: {
        local: {
          get(keys: string[]): Promise<Record<string, unknown>>;
          set(value: Record<string, unknown>): Promise<void>;
        };
        onChanged: StorageChanges;
      };
    };
  }
).chrome.storage;
export async function run() {
  const original = await storage.local.get(["provider_settings"]);
  const raw = original.provider_settings;
  if (!raw || typeof raw !== "object") throw new Error("WATCH_FIXTURE_SOURCE");
  const source = {
    get: (keys: string[]) => storage.local.get(keys),
    async assertFrozen(epoch: number) {
      if (epoch !== 1) throw new Error("WATCH_FIXTURE_EPOCH");
    },
  };
  const watched = watchFrozenSource(
    source,
    storage.onChanged,
    "local",
    ["provider_settings"],
    1,
  );
  try {
    await watched.get(["provider_settings"]);
    await storage.local.set({ provider_settings: { ...raw, revision: 999 } });
    let changed = false;
    for (let i = 0; i < 100 && !changed; i++) {
      try {
        await watched.assertFrozen(1);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          error.message !== "MIGRATION_SOURCE_CHANGED"
        )
          throw error;
        changed = true;
      }
      if (!changed) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!changed) throw new Error("WATCH_EVENT_MISSING");
    await storage.local.set(original);
    try {
      await watched.assertFrozen(1);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "MIGRATION_SOURCE_CHANGED"
      )
        return true;
      throw error;
    }
    throw new Error("WATCH_REVERT_ACCEPTED");
  } finally {
    await storage.local.set(original);
    watched.dispose();
  }
}
