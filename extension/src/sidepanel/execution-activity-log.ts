export const createExecutionActivityLog = () => {
  const entries: Array<{ runId?: string; text: string }> = [];
  let responding: string | undefined;
  const append = (entry: { runId?: string; text: string }): void => {
    entries.push(entry);
    if (entries.length > 50) entries.shift();
  };
  return {
    collection(text: string): void {
      responding = undefined;
      append({ text });
    },
    providerStart(_runId: string): void {
      responding = undefined;
    },
    providerResponse(runId: string, text: string): void {
      if (!text) return;
      const previous = entries.at(-1);
      if (responding === runId && previous?.runId === runId)
        previous.text = (previous.text + text).slice(0, 4000);
      else append({ runId, text: ("ai " + text).slice(0, 4000) });
      responding = runId;
    },
    lines(): string[] {
      return entries.map((entry) => entry.text);
    },
    clear(): void {
      entries.splice(0);
      responding = undefined;
    },
  };
};
