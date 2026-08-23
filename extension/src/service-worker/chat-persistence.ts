export type ChatSessionStorage = {
  set(value: Record<string, unknown>): Promise<void>;
};

export class ChatPersistence {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue = Promise.resolve();

  public constructor(
    private readonly storage: ChatSessionStorage | undefined,
    private readonly snapshot: () => unknown,
    private readonly delayMs = 250,
  ) {}

  public schedule(immediate = false): void {
    if (immediate) return this.flush();
    if (this.timer !== undefined) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.persist();
    }, this.delayMs);
  }

  public flush(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    void this.persist();
  }

  public clearScheduled(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  public clear(): Promise<void> {
    this.clearScheduled();
    if (!this.storage) return Promise.resolve();
    this.queue = this.queue
      .catch(() => undefined)
      .then(() => this.storage?.set({ chat_session_v1: null }))
      .catch(() => undefined)
      .then(() => undefined);
    return this.queue;
  }

  private persist(): Promise<void> {
    if (!this.storage) return Promise.resolve();
    this.queue = this.queue
      .catch(() => undefined)
      .then(() => this.storage?.set({ chat_session_v1: this.snapshot() }))
      .catch(() => undefined)
      .then(() => undefined);
    return this.queue;
  }
}
