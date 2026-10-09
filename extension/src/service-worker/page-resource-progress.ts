// Metadata only: repeated pages never increase the number of inspected resources.
export const createPageResourceProgress = () => {
  let revision: string | undefined;
  const scans = new Map<string, Map<string, boolean>>();
  return {
    resetOnSourceChange(error: unknown) {
      if (error instanceof Error && error.message === "SOURCE_CHANGED") {
        scans.clear();
        revision = undefined;
      }
    },
    record(
      currentRevision: string,
      key: string,
      page: Array<{ resource_id: string; available: boolean }>,
      total: number,
      truncated: boolean,
    ) {
      if (revision !== currentRevision) {
        scans.clear();
        revision = currentRevision;
      }
      const inspected = scans.get(key) ?? new Map<string, boolean>();
      for (const item of page) inspected.set(item.resource_id, item.available);
      scans.set(key, inspected);
      const available = [...inspected.values()].filter(Boolean).length;
      return {
        inspected_count: inspected.size,
        available_count: available,
        unavailable_count: inspected.size - available,
        total_count: total,
        complete: !truncated && available === total,
      };
    },
  };
};
