import type { BridgeEvent } from "@contextpilot/shared/bridge";
export class EventReplay {
  private events: BridgeEvent[] = [];
  private sequence = 0;
  constructor(private limit = 256) {
    if (limit < 1 || limit > 4096) throw new Error("EVENT_LIMIT");
  }
  append(kind: string): BridgeEvent {
    if (kind.length > 128) throw new Error("EVENT_SIZE");
    const event = { sequence: ++this.sequence, revision: this.sequence, kind };
    this.events.push(event);
    if (this.events.length > this.limit) this.events.shift();
    return { ...event };
  }
  resume(after: number) {
    if (!Number.isSafeInteger(after) || after < 0 || after > this.sequence)
      throw new Error("INVALID_CURSOR");
    const resync = after < (this.events[0]?.sequence ?? 1) - 1;
    return {
      events: resync
        ? []
        : this.events.filter((e) => e.sequence > after).map((e) => ({ ...e })),
      cursor: this.sequence,
      resync,
      snapshot: resync ? { revision: this.sequence, state: "waiting" } : null,
    };
  }
}
