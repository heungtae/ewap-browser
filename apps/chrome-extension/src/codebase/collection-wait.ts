// Bound Chrome metadata waits as well as the content transport itself.
export async function waitForCollection<T>(
  work: Promise<T>,
  signal: AbortSignal,
  deadline: number,
): Promise<T> {
  let abort: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error("COLLECTION_CANCELLED"));
        signal.addEventListener("abort", abort, { once: true });
        timer = setTimeout(abort, Math.max(0, deadline - Date.now()));
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
  }
}
