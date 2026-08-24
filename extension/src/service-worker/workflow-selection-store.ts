type Dependencies<T> = {
  get(key: string): Promise<Record<string, unknown> | undefined>;
  set(value: Record<string, unknown>): Promise<void>;
  serialize(selection: T): unknown;
  deserialize(value: unknown): T;
  id(selection: T): string;
  expired(selection: T, now: number): boolean;
};

const storageKey = "contextpilot_pending_workflow_selections_v1";

export const createWorkflowSelectionStore = <T>(
  dependencies: Dependencies<T>,
) => {
  const values = new Map<string, T>();
  const selection = (id: unknown): T | undefined => {
    if (typeof id !== "string") return undefined;
    const value = values.get(id);
    if (!value || dependencies.expired(value, Date.now())) {
      if (value) values.delete(id);
      return undefined;
    }
    return value;
  };
  const persist = async (): Promise<void> => {
    const now = Date.now();
    for (const [id, value] of values)
      if (dependencies.expired(value, now)) values.delete(id);
    await dependencies.set({
      [storageKey]: {
        schema_version: 1,
        selections: [...values.values()].map(dependencies.serialize),
      },
    });
  };
  const restore = async (): Promise<void> => {
    const stored = await dependencies.get(storageKey);
    const value = stored?.[storageKey];
    if (
      !value ||
      typeof value !== "object" ||
      (value as { schema_version?: unknown }).schema_version !== 1 ||
      !Array.isArray((value as { selections?: unknown }).selections) ||
      (value as { selections: unknown[] }).selections.length > 8 ||
      Object.keys(value).some(
        (key) => key !== "schema_version" && key !== "selections",
      )
    )
      return;
    for (const item of (value as { selections: unknown[] }).selections)
      try {
        const restored = dependencies.deserialize(item);
        if (!dependencies.expired(restored, Date.now()))
          values.set(dependencies.id(restored), restored);
      } catch {
        // Persisted workflow candidates are recoverable convenience only.
      }
  };
  return { values, selection, persist, restore };
};
