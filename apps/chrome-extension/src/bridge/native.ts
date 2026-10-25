import {
  challengeSchema,
  readySchema,
  responseSchema,
} from "@contextpilot/shared/bridge";
export interface NativePort {
  postMessage(value: unknown): void;
  disconnect(): void;
  onMessage: { addListener(callback: (value: unknown) => void): void };
  onDisconnect: { addListener(callback: () => void): void };
}
export interface Pairing {
  installationId: string;
  profileId: string;
  extensionId: string;
  secret: string;
}
const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
export class NativeBridge {
  private identity:
    | { connectionId: string; connectionEpoch: number }
    | undefined;
  private pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readyResolve: (() => void) | undefined;
  private readyReject: ((error: Error) => void) | undefined;
  private ready: Promise<void>;
  private timer: ReturnType<typeof setTimeout>;
  private closed = false;
  private capabilities = new Set<string>();
  constructor(
    private port: NativePort,
    private pairing: Pairing,
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    void this.ready.catch(() => undefined);
    this.timer = setTimeout(() => this.close(), 5000);
    port.onMessage.addListener((value) => {
      void this.receive(value).catch(() => this.close());
    });
    port.onDisconnect.addListener(() => this.close());
  }
  private async receive(value: unknown): Promise<void> {
    if (!value || typeof value !== "object" || this.closed)
      throw new Error("INVALID_HOST_RESPONSE");
    const v = value as Record<string, unknown>;
    if (v.kind === "challenge" && !this.identity) {
      if (
        v.major !== 1 ||
        v.minor !== 0 ||
        typeof v.nonce !== "string" ||
        !/^[a-f0-9]{64}$/.test(v.nonce)
      )
        throw new Error("VERSION");
      challengeSchema.parse(value);
      const p = this.pairing;
      const keyBytes = new TextEncoder().encode(p.secret);
      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const data = new TextEncoder().encode(
        JSON.stringify([
          1,
          0,
          p.installationId,
          p.profileId,
          p.extensionId,
          v.nonce,
        ]),
      );
      const proof = hex(await crypto.subtle.sign("HMAC", key, data));
      this.port.postMessage({
        kind: "hello",
        major: 1,
        minor: 0,
        installationId: p.installationId,
        profileId: p.profileId,
        extensionId: p.extensionId,
        nonce: v.nonce,
        proof,
      });
    } else if (v.kind === "ready" && !this.identity) {
      if (
        typeof v.connectionId !== "string" ||
        !Number.isSafeInteger(v.connectionEpoch)
      )
        throw new Error("SESSION");
      this.capabilities = new Set(readySchema.parse(value).capabilities);
      this.identity = {
        connectionId: v.connectionId,
        connectionEpoch: v.connectionEpoch as number,
      };
      clearTimeout(this.timer);
      this.readyResolve?.();
    } else if (typeof v.messageId === "string") {
      responseSchema.parse(value);
      const waiting = this.pending.get(v.messageId);
      if (!waiting) throw new Error("UNBOUND_RESPONSE");
      clearTimeout(waiting.timer);
      this.pending.delete(v.messageId);
      waiting.resolve(v.result);
    } else throw new Error("UNEXPECTED_MESSAGE");
  }
  async request(payload: {
    kind: string;
    afterSequence?: number;
  }): Promise<unknown> {
    await this.ready;
    if (this.closed || !this.identity || this.pending.size >= 4)
      throw new Error("BACKEND_UNAVAILABLE");
    if (
      payload.kind.startsWith("migration.") &&
      !this.capabilities.has(
        payload.kind === "migration.status"
          ? "migration.status"
          : "migration.policy",
      )
    )
      throw new Error("MIGRATION_UNAVAILABLE");
    const messageId = crypto.randomUUID();
    const payloadDigest = hex(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(payload)),
      ),
    );
    if (this.closed || !this.identity || this.pending.size >= 4)
      throw new Error("BACKEND_UNAVAILABLE");
    const now = Date.now();
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        reject(new Error("BRIDGE_TIMEOUT"));
      }, 5000);
      this.pending.set(messageId, { resolve, reject, timer });
    });
    try {
      this.port.postMessage({
        major: 1,
        minor: 0,
        messageId,
        ...this.identity,
        installationId: this.pairing.installationId,
        profileId: this.pairing.profileId,
        sender: "extension",
        sentAt: now,
        deadline: now + 5000,
        payloadDigest,
        payload,
      });
    } catch {
      const waiting = this.pending.get(messageId)!;
      clearTimeout(waiting.timer);
      this.pending.delete(messageId);
      waiting.reject(new Error("BACKEND_DISCONNECTED"));
    }
    return result;
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.identity = undefined;
    const error = new Error("BACKEND_DISCONNECTED");
    this.readyReject?.(error);
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.port.disconnect();
  }
}
