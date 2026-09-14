export class RequestBudget {
  private readonly entries = new Map<
    string,
    {
      remaining: number;
      since: number;
      waiting: boolean;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  public start(id: string, expire: () => void): void {
    this.stop(id);
    this.entries.set(id, {
      remaining: 180_000,
      since: Date.now(),
      waiting: false,
      timer: setTimeout(expire, 180_000),
    });
  }
  public stage(id: string, waiting: boolean, expire: () => void): void {
    const entry = this.entries.get(id);
    if (!entry || entry.waiting === waiting) return;
    clearTimeout(entry.timer);
    if (!entry.waiting) entry.remaining -= Date.now() - entry.since;
    entry.waiting = waiting;
    entry.since = Date.now();
    entry.timer = setTimeout(
      expire,
      waiting ? 300_000 : Math.max(0, entry.remaining),
    );
  }
  public stop(id: string): void {
    const entry = this.entries.get(id);
    if (entry) clearTimeout(entry.timer);
    this.entries.delete(id);
  }
}
