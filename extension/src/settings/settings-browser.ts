type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};
type BrowserRuntime = {
  sendMessage(message: unknown): Promise<unknown>;
};
type BrowserPermissions = {
  contains(query: {
    permissions?: string[];
    origins?: string[];
  }): Promise<boolean>;
  request(query: {
    permissions?: string[];
    origins?: string[];
  }): Promise<boolean>;
  remove(query: {
    permissions?: string[];
    origins?: string[];
  }): Promise<boolean>;
};
export const storage = (
  globalThis as typeof globalThis & {
    chrome?: { runtime: BrowserRuntime; storage: { local: StorageArea } };
  }
).chrome?.storage.local;
export const runtime = (
  globalThis as typeof globalThis & {
    chrome?: { runtime: BrowserRuntime };
  }
).chrome?.runtime;
export const browserPermissions = (
  globalThis as typeof globalThis & {
    chrome?: { permissions?: BrowserPermissions };
  }
).chrome?.permissions;
