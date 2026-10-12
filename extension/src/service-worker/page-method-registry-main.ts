/** Document-local identity registry; tokens are locators, never approval grants. */
export const installPageMethodRegistryMain = (key: string): boolean => {
  if (Object.getOwnPropertyDescriptor(globalThis, key)) return true;
  type Entry = { owner: object; fn: unknown; path: string; token: string };
  const entries: Entry[] = [];
  const registry = Object.freeze({
    register(owner: object, fn: unknown, path: string[]): string {
      const locator = JSON.stringify(path);
      const existing = entries.find(
        (entry) =>
          entry.owner === owner && entry.fn === fn && entry.path === locator,
      );
      if (existing) return existing.token;
      const token = crypto.randomUUID();
      entries.push({ owner, fn, path: locator, token });
      if (entries.length > 192) entries.shift();
      return token;
    },
    matches(token: string, owner: object, fn: unknown): boolean {
      return entries.some(
        (entry) =>
          entry.token === token && entry.owner === owner && entry.fn === fn,
      );
    },
  });
  Object.defineProperty(globalThis, key, {
    value: registry,
    enumerable: false,
  });
  return true;
};
