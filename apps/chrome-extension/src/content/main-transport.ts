import type { FrameBinding } from "../codebase/chrome-collector.js";
export interface MainTransportApi {
  webNavigation: {
    getFrame(query: {
      tabId: number;
      frameId: number;
    }): Promise<FrameBinding | undefined>;
  };
  scripting: {
    executeScript(input: {
      target: { tabId: number; documentIds: string[] };
      world: "MAIN";
      func: (...args: never[]) => unknown;
      args: unknown[];
    }): Promise<{ documentId?: string; frameId?: number; result?: unknown }[]>;
  };
}
export interface MainAdmission {
  tabId: number;
  frameId: number;
  binding: FrameBinding;
  deadline: number;
  signal: AbortSignal;
  current(): boolean;
  // Trusted policy/lease caller supplies the final dispatch check. No UI route.
  beforeDispatch(): void;
}
export class MainInjectionError extends Error {
  constructor(readonly dispatched: boolean) {
    super(dispatched ? "MAIN_INJECTION_UNCERTAIN" : "MAIN_INJECTION_DENIED");
  }
}
// Injection primitive only: no planning, grants, retries or interpretation of
// returned page data. A post-dispatch failure must be reconciled by its caller.
export async function injectMainFrame(
  api: MainTransportApi,
  admission: MainAdmission,
  func: (...args: never[]) => unknown,
  args: unknown[],
): Promise<unknown> {
  const { tabId, frameId, signal } = admission;
  const binding = { ...admission.binding };
  const deadline = Math.min(admission.deadline, Date.now() + 5000);
  let active = true,
    dispatched = false;
  const failure = () => new MainInjectionError(dispatched);
  const check = () => {
    if (
      !active ||
      signal.aborted ||
      !admission.current() ||
      !Number.isSafeInteger(tabId) ||
      tabId < 0 ||
      !Number.isSafeInteger(frameId) ||
      frameId < 0 ||
      !binding.documentId ||
      !binding.url ||
      !Number.isFinite(deadline) ||
      Date.now() >= deadline
    )
      throw failure();
  };
  const frame = async () => {
    check();
    const live = await api.webNavigation.getFrame({
      tabId: tabId,
      frameId: frameId,
    });
    check();
    if (
      !live ||
      live.documentId !== binding.documentId ||
      live.url !== binding.url ||
      live.errorOccurred ||
      live.documentLifecycle !== "active"
    )
      throw failure();
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    check();
    const interrupted = new Promise<never>((_resolve, reject) => {
      abort = () => reject(failure());
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(
        () => reject(failure()),
        Math.max(1, deadline - Date.now()),
      );
    });
    const run = async () => {
      await frame();
      admission.beforeDispatch();
      check();
      dispatched = true;
      const results = await api.scripting.executeScript({
        target: { tabId: tabId, documentIds: [binding.documentId] },
        world: "MAIN",
        func,
        args,
      });
      check();
      if (
        results.length !== 1 ||
        results[0]?.documentId !== binding.documentId ||
        results[0]?.frameId !== frameId
      )
        throw failure();
      await frame();
      return results[0]?.result;
    };
    return await Promise.race([run(), interrupted]);
  } catch {
    throw failure();
  } finally {
    active = false;
    clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
  }
}
