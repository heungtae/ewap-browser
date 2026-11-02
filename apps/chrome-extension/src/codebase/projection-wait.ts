export async function waitForProjection<T>(
  work: Promise<T>,
  deadline: number,
  expired: () => void,
  signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      abort = () => {
        expired();
        reject(Error("PROJECTION_CANCELLED"));
      };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(abort, Math.max(0, deadline - Date.now()));
    });
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}
