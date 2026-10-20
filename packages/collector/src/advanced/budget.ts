export class CollectorBudget {
  private captures = 0;
  private units = 0;
  private active = 0;
  private bytesUsed = 0;
  private targets = new Set<string>();
  private pages = new Set<string>();
  constructor(
    private options: {
      deadline: number;
      now(): number;
      current(): boolean;
      signal: AbortSignal;
    },
  ) {}
  assert(): void {
    if (this.options.signal.aborted) throw new Error("CANCELLED");
    if (!this.options.current()) throw new Error("DOCUMENT_CHANGED");
    if (this.options.now() >= this.options.deadline)
      throw new Error("TASK_EXPIRED");
  }
  chargeBytes(bytes: number): void {
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      this.bytesUsed + bytes > 16 * 1024 * 1024
    )
      throw new Error("TASK_BYTE_LIMIT");
    this.bytesUsed += bytes;
  }
  async run<T>(
    page: string,
    target: string,
    read: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    this.assert();
    if (
      this.units >= 64 ||
      this.active >= 2 ||
      (!this.targets.has(target) && this.targets.size >= 16) ||
      (!this.pages.has(page) && this.pages.size >= 8)
    )
      throw new Error("COLLECTOR_BUDGET");
    this.units++;
    this.active++;
    this.targets.add(target);
    this.pages.add(page);
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.options.signal.addEventListener("abort", abort, { once: true });
    const started = this.options.now();
    const unitDeadline = Math.min(started + 10000, this.options.deadline);
    const ms = unitDeadline - started;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("UNIT_TIMEOUT"));
      }, ms);
    });
    const cancelled = new Promise<never>((_, reject) =>
      controller.signal.addEventListener(
        "abort",
        () =>
          reject(
            new Error(
              this.options.signal.aborted ? "CANCELLED" : "UNIT_TIMEOUT",
            ),
          ),
        { once: true },
      ),
    );
    try {
      const value = await Promise.race([
        read(controller.signal),
        timeout,
        cancelled,
      ]);
      this.assert();
      if (this.options.now() >= unitDeadline) throw new Error("UNIT_TIMEOUT");
      return value;
    } finally {
      clearTimeout(timer);
      controller.abort();
      this.options.signal.removeEventListener("abort", abort);
      this.active--;
    }
  }
  reserveCapture(): void {
    this.assert();
    if (this.captures >= 2) throw new Error("SCREENSHOT_COUNT_LIMIT");
    this.captures++;
  }
  snapshot() {
    return {
      units: this.units,
      active: this.active,
      bytes: this.bytesUsed,
      targets: this.targets.size,
      pages: this.pages.size,
    };
  }
}
