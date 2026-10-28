import type { FrozenSource } from "./local-staging.js";

export interface StorageChanges {
  addListener(
    listener: (changes: Record<string, unknown>, area: string) => void,
  ): void;
  removeListener(
    listener: (changes: Record<string, unknown>, area: string) => void,
  ): void;
}

// Observation only: this does not prevent writes or establish writer ownership.
export function watchFrozenSource(
  source: FrozenSource,
  events: StorageChanges,
  area: "local" | "session",
  watchedKeys: readonly string[],
  epoch: number,
): FrozenSource & { dispose(): void } {
  if (
    !Number.isSafeInteger(epoch) ||
    epoch < 1 ||
    !watchedKeys.length ||
    watchedKeys.some((key) => !key)
  )
    throw new Error("MIGRATION_WATCH_SCOPE");
  const keys = new Set(watchedKeys);
  let invalid = false;
  const listener = (changes: Record<string, unknown>, changedArea: string) => {
    if (
      changedArea === area &&
      Object.keys(changes).some((key) => keys.has(key))
    )
      invalid = true;
  };
  events.addListener(listener);
  const check = () => {
    if (invalid) throw new Error("MIGRATION_SOURCE_CHANGED");
  };
  return {
    async assertFrozen(currentEpoch) {
      check();
      if (currentEpoch !== epoch) throw new Error("MIGRATION_WATCH_EPOCH");
      await source.assertFrozen(currentEpoch);
      check();
    },
    async get(requested) {
      check();
      if (requested.some((key) => !keys.has(key)))
        throw new Error("MIGRATION_WATCH_SCOPE");
      await source.assertFrozen(epoch);
      check();
      const result = await source.get(requested);
      check();
      await source.assertFrozen(epoch);
      check();
      return result;
    },
    dispose() {
      if (invalid) {
        events.removeListener(listener);
        return;
      }
      invalid = true;
      events.removeListener(listener);
    },
  };
}
