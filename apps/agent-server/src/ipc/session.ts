import { createHash, randomUUID } from "node:crypto";
import { envelopeSchema } from "@contextpilot/shared/bridge";
import type { Pairing } from "./auth.js";
export const digest = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export class Session {
  readonly connectionId = randomUUID();
  private seen = new Set<string>();
  private lastSentAt = 0;
  messageId = "";
  browserGeneration: number | undefined;
  constructor(
    readonly pairing: Pairing,
    readonly connectionEpoch: number,
  ) {}
  accept(input: unknown, now: number) {
    const e = envelopeSchema.parse(input);
    if (
      e.connectionId !== this.connectionId ||
      e.connectionEpoch !== this.connectionEpoch ||
      e.profileId !== this.pairing.profileId ||
      e.installationId !== this.pairing.installationId ||
      e.deadline < now ||
      e.deadline > now + 60_000 ||
      e.sentAt > now + 1000 ||
      e.sentAt < this.lastSentAt ||
      this.seen.has(e.messageId) ||
      digest(e.payload) !== e.payloadDigest
    )
      throw new Error("INVALID_ENVELOPE");
    if (this.seen.size >= 4096) throw new Error("SESSION_LIMIT");
    this.messageId = e.messageId;
    this.seen.add(e.messageId);
    this.lastSentAt = e.sentAt;
    if (e.payload.kind === "browser.connected") {
      if (
        this.browserGeneration !== undefined &&
        e.payload.generation <= this.browserGeneration
      )
        throw new Error("STALE_BROWSER");
      this.browserGeneration = e.payload.generation;
    }
    if (e.payload.kind === "browser.disconnected") this.disconnect();
    return e.payload;
  }
  disconnect(): void {
    this.browserGeneration = undefined;
  }
  browserAvailable(): boolean {
    return this.browserGeneration !== undefined;
  }
}
