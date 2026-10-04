import { append, methods } from "./trace-recording.js";
import {
  identify,
  getCurrentMethodContext,
  withMethodContext,
  type MethodContext,
} from "./trace-context.js";
export { setMethodTraceLevel } from "./trace-recording.js";
export { withMethodContext, type MethodContext } from "./trace-context.js";
export { methodTraceSnapshot } from "./trace-snapshot.js";
export const traceMethod = <T>(
  method: string,
  input: unknown,
  action: (context: MethodContext) => T,
  parent?: MethodContext,
): T => {
  const context: MethodContext = {
    call_id: crypto.randomUUID(),
    ...((getCurrentMethodContext() ?? parent)
      ? { parent: getCurrentMethodContext() ?? parent }
      : {}),
  };
  identify(input, context);
  const started = performance.now();
  const summary = methods.get(method) ?? {
    calls: 0,
    completed: 0,
    errors: 0,
    total_ms: 0,
    last_call_id: context.call_id,
  };
  summary.calls++;
  summary.last_call_id = context.call_id;
  methods.set(method, summary);
  append(context, method, "method.enter", "debug", { call: summary.calls });
  append(context, method, "method.input", "trace", input);
  const finish = (result: unknown, failed: boolean): void => {
    identify(result, context);
    const elapsed = Math.max(0, performance.now() - started);
    summary.total_ms += elapsed;
    if (failed) summary.errors++;
    else summary.completed++;
    append(
      context,
      method,
      failed ? "method.throw" : "method.exit",
      failed ? "error" : "debug",
      failed ? result : { completed: true },
      elapsed,
    );
    if (!failed)
      append(context, method, "method.result", "trace", result, elapsed);
  };
  try {
    const result = withMethodContext(context, () => action(context));
    if (result instanceof Promise)
      return result.then(
        (value) => {
          finish(value, false);
          return value;
        },
        (error: unknown) => {
          finish(error, true);
          throw error;
        },
      ) as T;
    finish(result, false);
    return result;
  } catch (error) {
    finish(error, true);
    throw error;
  }
};
export const traceDecision = (method: string, detail: unknown): void => {
  const context = getCurrentMethodContext() ?? { call_id: crypto.randomUUID() };
  identify(detail, context);
  append(context, method, "method.decision", "debug", detail);
};
type ConstructorContext = MethodContext & {
  method: string;
  started: number;
  failed?: boolean;
};
export const traceConstructorStart = (
  method: string,
  input: unknown,
  parent?: MethodContext,
): ConstructorContext => {
  const context: ConstructorContext = {
    call_id: crypto.randomUUID(),
    method,
    started: performance.now(),
    ...((getCurrentMethodContext() ?? parent)
      ? { parent: getCurrentMethodContext() ?? parent }
      : {}),
  };
  identify(input, context);
  const summary = methods.get(method) ?? {
    calls: 0,
    completed: 0,
    errors: 0,
    total_ms: 0,
    last_call_id: context.call_id,
  };
  summary.calls++;
  summary.last_call_id = context.call_id;
  methods.set(method, summary);
  append(context, method, "method.enter", "debug", { call: summary.calls });
  append(context, method, "method.input", "trace", input);
  return context;
};
export const traceConstructorError = (
  context: ConstructorContext,
  error: unknown,
): void => {
  context.failed = true;
  append(
    context,
    context.method,
    "method.throw",
    "error",
    error,
    performance.now() - context.started,
  );
};
export const traceConstructorEnd = (context: ConstructorContext): void => {
  const elapsed = performance.now() - context.started;
  const summary = methods.get(context.method)!;
  summary.total_ms += elapsed;
  if (context.failed) summary.errors++;
  else summary.completed++;
  append(
    context,
    context.method,
    "method.exit",
    "debug",
    { completed: !context.failed },
    elapsed,
  );
};

export const traceBranch = <T>(
  context: MethodContext,
  method: string,
  branch: string,
  result: T,
  condition?: string,
): T => {
  append(context, method, "method.branch", "debug", {
    branch,
    ...(condition ? { condition } : {}),
    result,
  });
  return result;
};
