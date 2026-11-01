import { randomUUID } from "node:crypto";
import type { BridgeEvent } from "@contextpilot/shared/bridge";
export class EventReplay {
  private events: BridgeEvent[] = [];
  private sequence = 0;
  private streamId = randomUUID();
  constructor(
    private limit = 256,
    private connectionOnly = false,
  ) {
    if (limit < 1 || limit > 4096) throw new Error("EVENT_LIMIT");
  }
  append(kind: string): BridgeEvent {
    if (
      this.connectionOnly &&
      !["browser.connected", "browser.waiting"].includes(kind)
    )
      throw new Error("CONNECTION_EVENT_REQUIRED");
    if (kind.length > 128) throw new Error("EVENT_SIZE");
    const event = { sequence: ++this.sequence, revision: this.sequence, kind };
    this.events.push(event);
    if (this.events.length > this.limit) this.events.shift();
    return { ...event };
  }
  resume(after: number, streamId?: string) {
    if (
      !Number.isSafeInteger(after) ||
      after < 0 ||
      (after > this.sequence && !this.connectionOnly)
    )
      throw new Error("INVALID_CURSOR");
    const resync =
      after < (this.events[0]?.sequence ?? 1) - 1 ||
      (this.connectionOnly &&
        (streamId !== this.streamId || after > this.sequence));
    return {
      events: resync
        ? []
        : this.events.filter((e) => e.sequence > after).map((e) => ({ ...e })),
      cursor: this.sequence,
      resync,
      ...(this.connectionOnly ? { streamId: this.streamId } : {}),
      snapshot: resync
        ? {
            revision: this.sequence,
            state: "waiting" as const,
            ...(this.connectionOnly
              ? {
                  schema: "wca.connection-snapshot/v1" as const,
                  streamId: this.streamId,
                }
              : {}),
          }
        : null,
    };
  }
}
