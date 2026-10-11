import type { MainPageMethodOutcome } from "../contracts/page-method-types.js";

/** Resolve and invoke a fresh own-property path in one fixed bundled function. */
export const invokePageMethodMain = async (
  path: string[],
  expectedRevision: string,
  expectedName: string,
  expectedArity: number,
  arguments_: unknown[],
): Promise<MainPageMethodOutcome> => {
  const validSegment = (value: string): boolean =>
    value.length > 0 &&
    value.length <= 100 &&
    !["__proto__", "prototype", "constructor"].includes(value);
  const boundedValue = (
    input: unknown,
  ): { value: unknown; truncated: boolean } => {
    let nodes = 0;
    let truncated = false;
    const seen = new WeakSet<object>();
    const visit = (value: unknown, depth: number): unknown => {
      nodes++;
      if (nodes > 256 || depth > 6) {
        truncated = true;
        return "[TRUNCATED]";
      }
      if (
        value === null ||
        typeof value === "boolean" ||
        typeof value === "number"
      )
        return typeof value === "number" && !Number.isFinite(value)
          ? String(value)
          : value;
      if (typeof value === "string") {
        if (value.length > 4096) truncated = true;
        return value.slice(0, 4096);
      }
      if (typeof value !== "object" || seen.has(value)) {
        truncated = true;
        return "[UNSUPPORTED]";
      }
      seen.add(value);
      try {
        const array = Array.isArray(value);
        if (
          !array &&
          Object.getPrototypeOf(value) !== Object.prototype &&
          Object.getPrototypeOf(value) !== null
        ) {
          truncated = true;
          return "[UNSUPPORTED_OBJECT]";
        }
        const allKeys = array
          ? Array.from(
              { length: Math.min((value as unknown[]).length, 64) },
              (_, index) => String(index),
            )
          : Object.keys(value);
        const keys = allKeys.slice(0, 64);
        if (
          allKeys.length > keys.length ||
          (array && (value as unknown[]).length > 64)
        )
          truncated = true;
        const output: Record<string, unknown> | unknown[] = array
          ? []
          : Object.create(null);
        for (const key of keys) {
          if (!array && !validSegment(key)) {
            truncated = true;
            continue;
          }
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          if (!descriptor || !("value" in descriptor)) {
            truncated = true;
            if (array) (output as unknown[]).push(null);
            continue;
          }
          const item = visit(descriptor.value, depth + 1);
          if (array) (output as unknown[]).push(item);
          else (output as Record<string, unknown>)[key] = item;
        }
        return output;
      } catch {
        truncated = true;
        return "[UNAVAILABLE]";
      }
    };
    return { value: visit(input, 0), truncated };
  };
  const revisionOf = (
    fn: (...args: never[]) => unknown,
    name: string,
    arity: number,
  ): string => {
    const source = Function.prototype.toString.call(fn);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++)
      hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
    return `${name}:${arity}:${source.length}:${(hash >>> 0).toString(16)}`;
  };
  if (
    !Array.isArray(path) ||
    path.length < 1 ||
    path.length > 4 ||
    path.some((part) => typeof part !== "string" || !validSegment(part)) ||
    !Array.isArray(arguments_) ||
    arguments_.length > 32
  )
    return { status: "invalid" };
  try {
    let owner: unknown = globalThis;
    for (const part of path.slice(0, -1)) {
      if (
        (typeof owner !== "object" && typeof owner !== "function") ||
        owner === null
      )
        return { status: "not_found" };
      const descriptor = Object.getOwnPropertyDescriptor(owner, part);
      if (!descriptor || !("value" in descriptor))
        return { status: "not_found" };
      owner = descriptor.value;
    }
    if (
      (typeof owner !== "object" && typeof owner !== "function") ||
      owner === null
    )
      return { status: "not_found" };
    const method = Object.getOwnPropertyDescriptor(
      owner,
      path[path.length - 1]!,
    );
    if (!method || !("value" in method) || typeof method.value !== "function")
      return { status: "not_found" };
    const name = Object.getOwnPropertyDescriptor(method.value, "name")?.value;
    const arity = Object.getOwnPropertyDescriptor(
      method.value,
      "length",
    )?.value;
    if (
      typeof name !== "string" ||
      typeof arity !== "number" ||
      name !== expectedName ||
      Math.min(arity, 32) !== expectedArity ||
      revisionOf(
        method.value as (...args: never[]) => unknown,
        name,
        Math.min(arity, 32),
      ) !== expectedRevision
    )
      return { status: "stale" };
    const returned = await Reflect.apply(method.value, owner, arguments_);
    const safe = boundedValue(returned);
    return { status: "returned", ...safe };
  } catch {
    return { status: "threw" };
  }
};
