import { opaqueId } from "../security/canonical.js";

type Pending = {
  runId: string;
  current(): boolean;
  finish(allowed: boolean): void;
};
const pending = new Map<string, Pending>();
export const requestSourceConsent = (opts: {
  runId: string;
  signal?: AbortSignal;
  current(): boolean;
  publish(requestId: string): void;
}): Promise<boolean> =>
  new Promise((resolve) => {
    if (opts.signal?.aborted || !opts.current()) {
      resolve(false);
      return;
    }
    const id = opaqueId();
    const finish = (allowed: boolean) => {
      pending.delete(id);
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", abort);
      resolve(allowed && !opts.signal?.aborted && opts.current());
    };
    const abort = () => finish(false);
    const timer = setTimeout(abort, 120_000);
    pending.set(id, { runId: opts.runId, current: opts.current, finish });
    opts.signal?.addEventListener("abort", abort, { once: true });
    try {
      opts.publish(id);
    } catch {
      finish(false);
    }
  });
export const decideSourceConsent = (
  requestId: string,
  runId: string,
  allowed: boolean,
): boolean => {
  const item = pending.get(requestId);
  if (!item || item.runId !== runId) return false;
  const current = item.current();
  item.finish(allowed && current);
  return current;
};
