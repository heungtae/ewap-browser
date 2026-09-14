type Reply = Record<string, unknown>;
type Options = {
  send(message: unknown): Promise<Reply>;
  update(request: Reply): void;
  result(result: Reply): void;
  failure(code: string): void;
  connection(delayed: boolean): void;
};

export class RequestClient {
  private id: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private epoch = 0;
  private revision = 0;
  private delivered = false;
  private polling = false;
  public constructor(private readonly options: Options) {}
  public get requestId(): string | undefined {
    return this.id;
  }
  public reset(): void {
    this.epoch += 1;
    this.id = undefined;
    this.revision = 0;
    this.delivered = false;
    this.polling = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  public async start(prompt: string, mode: "ask" | "act"): Promise<void> {
    this.reset();
    const epoch = this.epoch;
    this.id = crypto.randomUUID();
    try {
      await this.send("CHAT_REQUEST_START", { payload: { prompt, mode } });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (
        !(error instanceof Error) ||
        error.message !== "REQUEST_ACK_TIMEOUT"
      ) {
        this.reset();
        throw error;
      }
      this.options.connection(true);
    }
    if (epoch === this.epoch) await this.poll();
  }
  public async cancel(): Promise<boolean> {
    if (!this.id) return false;
    const epoch = this.epoch;
    await this.send("CHAT_REQUEST_CANCEL");
    if (epoch === this.epoch) await this.poll();
    return true;
  }
  public async poll(): Promise<void> {
    if (!this.id || this.polling) return;
    this.polling = true;
    const epoch = this.epoch;
    try {
      const response = await this.send("CHAT_REQUEST_STATUS");
      if (epoch !== this.epoch) return;
      this.options.connection(false);
      const request = response.request as Reply | undefined;
      if (!request || typeof request.revision !== "number")
        throw new Error("INVALID_ARGUMENT");
      if (request.revision >= this.revision) {
        this.revision = request.revision;
        this.options.update(request);
      }
      if (
        !this.delivered &&
        response.result &&
        typeof response.result === "object"
      ) {
        this.delivered = true;
        this.options.result(response.result as Reply);
      }
      if (request.state === "TERMINAL") this.reset();
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (
        error instanceof Error &&
        [
          "REQUEST_NOT_FOUND",
          "PANEL_CONTEXT_UNAVAILABLE",
          "DOCUMENT_NOT_REGISTERED",
        ].includes(error.message)
      ) {
        this.reset();
        this.options.failure(error.message);
      } else this.options.connection(true);
    } finally {
      if (epoch === this.epoch) {
        this.polling = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.poll(), 3_000);
      }
    }
  }
  private async send(kind: string, extra: Reply = {}): Promise<Reply> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.options.send({
          schema_version: 1,
          kind,
          request_id: this.id,
          ...extra,
        }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("REQUEST_ACK_TIMEOUT")),
            5_000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
