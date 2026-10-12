import type { MainPageMethodCandidate } from "../contracts/page-method-types.js";

/** Serialized into the current MAIN document; returns labels, never code or page values. */
export const discoverPageMethodsMain = (
  registryKey = "__contextPilotMethodTestRegistry",
): MainPageMethodCandidate[] => {
  const registry = Object.getOwnPropertyDescriptor(globalThis, registryKey)
    ?.value as
    | { register(owner: object, fn: unknown, path: string[]): string }
    | undefined;
  if (!registry) return [];
  const isNative = (fn: unknown): boolean =>
    Function.prototype.toString.call(fn).includes("[native code]");
  const hiddenRoots = new Set([
    "window",
    "self",
    "globalThis",
    "document",
    "location",
    "frames",
    "parent",
    "top",
    "opener",
    "chrome",
    "browser",
    "navigator",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
    "crypto",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "Worker",
    "Function",
    "eval",
    "setTimeout",
    "setInterval",
    "requestAnimationFrame",
  ]);
  const hiddenMethods = new Set([
    "constructor",
    "__proto__",
    "prototype",
    "eval",
    "Function",
    "fetch",
    "open",
    "submit",
    "sendBeacon",
    "postMessage",
    "setTimeout",
    "setInterval",
  ]);
  const validSegment = (value: string): boolean =>
    value.length > 0 &&
    value.length <= 100 &&
    !["__proto__", "prototype", "constructor"].includes(value);
  const found: MainPageMethodCandidate[] = [];
  const visited = new WeakSet<object>();
  const rootList = Object.getOwnPropertyNames(globalThis);
  const rootOrder = new Map(rootList.map((root, index) => [root, index]));
  const roots = rootList.sort((left, right) => {
    const leftDescriptor = Object.getOwnPropertyDescriptor(globalThis, left);
    const rightDescriptor = Object.getOwnPropertyDescriptor(globalThis, right);
    const leftEnumerable = leftDescriptor?.enumerable ? 1 : 0;
    const rightEnumerable = rightDescriptor?.enumerable ? 1 : 0;
    const rank = (descriptor: PropertyDescriptor | undefined): number =>
      descriptor &&
      "value" in descriptor &&
      typeof descriptor.value === "object" &&
      descriptor.value !== null
        ? 0
        : descriptor &&
            "value" in descriptor &&
            typeof descriptor.value === "function"
          ? 1
          : 2;
    return (
      rightEnumerable - leftEnumerable ||
      rank(leftDescriptor) - rank(rightDescriptor) ||
      (rootOrder.get(right) ?? 0) - (rootOrder.get(left) ?? 0)
    );
  });
  const scan = (value: object, path: string[], depth: number): void => {
    if (found.length >= 48 || depth > 2 || visited.has(value)) return;
    visited.add(value);
    let keys: string[];
    try {
      keys = Object.getOwnPropertyNames(value).slice(0, 40);
    } catch {
      return;
    }
    for (const key of keys) {
      if (!validSegment(key) || hiddenMethods.has(key) || found.length >= 48)
        continue;
      let descriptor: PropertyDescriptor | undefined;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
      } catch {
        continue;
      }
      if (!descriptor || !("value" in descriptor)) continue;
      const member = descriptor.value as unknown;
      if (typeof member === "function" && !isNative(member)) {
        let name: unknown;
        let arity: unknown;
        try {
          name = Object.getOwnPropertyDescriptor(member, "name")?.value;
          arity = Object.getOwnPropertyDescriptor(member, "length")?.value;
        } catch {
          continue;
        }
        if (
          typeof name !== "string" ||
          typeof arity !== "number" ||
          !Number.isSafeInteger(arity)
        )
          continue;
        const methodPath = [...path, key];
        found.push({
          object_path: methodPath,
          method_name: name.slice(0, 100) || key,
          arity: Math.min(arity, 32),
          function_kind: "unknown",
          locator_revision: registry.register(value, member, methodPath),
        });
      } else if (
        depth < 2 &&
        typeof member === "object" &&
        member !== null &&
        path.length < 2
      )
        scan(member as object, [...path, key], depth + 1);
    }
  };
  for (const root of roots) {
    if (
      root === registryKey ||
      root.startsWith("__contextPilotMethods_") ||
      hiddenRoots.has(root) ||
      hiddenMethods.has(root) ||
      !validSegment(root) ||
      found.length >= 48
    )
      continue;
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(globalThis, root);
    } catch {
      continue;
    }
    if (!descriptor || !("value" in descriptor)) continue;
    if (typeof descriptor.value === "function" && !isNative(descriptor.value)) {
      let name: unknown;
      let arity: unknown;
      try {
        name = Object.getOwnPropertyDescriptor(descriptor.value, "name")?.value;
        arity = Object.getOwnPropertyDescriptor(
          descriptor.value,
          "length",
        )?.value;
      } catch {
        continue;
      }
      if (
        typeof name === "string" &&
        typeof arity === "number" &&
        Number.isSafeInteger(arity)
      )
        found.push({
          object_path: [root],
          method_name: name.slice(0, 100) || root,
          arity: Math.min(arity, 32),
          function_kind: "unknown",
          locator_revision: registry.register(globalThis, descriptor.value, [
            root,
          ]),
        });
    } else if (
      typeof descriptor.value === "object" &&
      descriptor.value !== null
    ) {
      scan(descriptor.value as object, [root], 0);
    }
  }
  return found;
};
