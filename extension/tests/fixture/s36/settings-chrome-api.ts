export const chrome = (
  globalThis as unknown as {
    chrome: {
      runtime: {
        sendMessage(value: unknown): Promise<{ ok: boolean; result: unknown }>;
      };
      storage: {
        session: {
          get(keys: string[]): Promise<Record<string, unknown>>;
          set(value: Record<string, unknown>): Promise<void>;
        };
        local: {
          get(keys: string[]): Promise<Record<string, unknown>>;
          set(value: Record<string, unknown>): Promise<void>;
        };
      };
    };
  }
).chrome;
