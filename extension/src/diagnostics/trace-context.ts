type Correlation = {
  request_id?: string;
  tab_id?: number;
  run_id?: string;
  session_id?: string;
};
export type MethodContext = Correlation & {
  call_id: string;
  parent?: MethodContext | undefined;
};
let current: MethodContext | undefined;
export const correlation = (context?: MethodContext): Correlation => {
  const chain: MethodContext[] = [];
  for (let node = context; node && chain.length < 64; node = node.parent)
    chain.push(node);
  return Object.assign(
    {},
    ...chain.reverse().map(({ request_id, tab_id, run_id, session_id }) => ({
      ...(request_id ? { request_id } : {}),
      ...(tab_id === undefined ? {} : { tab_id }),
      ...(run_id ? { run_id } : {}),
      ...(session_id ? { session_id } : {}),
    })),
  );
};
export const identify = (
  input: unknown,
  context: MethodContext,
  depth = 0,
): void => {
  if (!input || typeof input !== "object" || depth > 3) return;
  const proto = Object.getPrototypeOf(input);
  if (proto !== Object.prototype && proto !== null) return;
  for (const [key, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(input),
  ).slice(0, 64)) {
    if (!("value" in descriptor)) continue;
    const value: unknown = descriptor.value;
    if (
      ["requestId", "request_id"].includes(key) &&
      typeof value === "string" &&
      /^[a-zA-Z0-9-]{16,64}$/.test(value)
    )
      context.request_id = value;
    else if (
      ["tabId", "tab_id", "fixedTabId"].includes(key) &&
      typeof value === "number"
    )
      context.tab_id = value;
    else if (
      ["run_id", "session_id"].includes(key) &&
      typeof value === "string" &&
      /^[a-zA-Z0-9-]{16,64}$/.test(value)
    )
      context[key as "run_id" | "session_id"] = value;
    else if (
      [
        "context",
        "requestContext",
        "request",
        "payload",
        "active",
        "session",
        "message",
        "sender",
        "tab",
      ].includes(key)
    )
      identify(value, context, depth + 1);
  }
};
/** Synchronous scope restoration avoids sharing context across concurrent promises. */
export const withMethodContext = <T>(
  context: MethodContext,
  action: () => T,
): T => {
  const previous = current;
  current = context;
  try {
    return action();
  } finally {
    current = previous;
  }
};

export const getCurrentMethodContext = (): MethodContext | undefined => current;
