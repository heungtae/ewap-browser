import type { BridgeEvent, TaskClient } from "@contextpilot/shared/bridge";
export interface Transport {
  request(
    kind: "resumeEvents",
    afterSequence: number,
  ): ReturnType<TaskClient["resume"]>;
}
export class BridgeClient implements TaskClient {
  private cursor = 0;
  private connected = false;
  private snapshotRequired = false;
  constructor(
    private transport: Transport,
    private render: (event: BridgeEvent) => void,
    private status: (text: string) => void,
  ) {}
  disconnect(): void {
    this.connected = false;
    this.status("Backend disconnected — waiting for reconnection");
  }
  async resume(afterSequence = this.cursor) {
    this.connected = false;
    const result = await this.transport.request("resumeEvents", afterSequence);
    if (result.resync) this.snapshotRequired = true;
    if (this.snapshotRequired) {
      this.status("Backend snapshot required — waiting");
      return result;
    }
    let next = this.cursor;
    for (const event of result.events) {
      if (event.sequence <= this.cursor) continue;
      if (event.sequence !== next + 1) {
        this.snapshotRequired = true;
        this.status("Backend snapshot required — waiting");
        throw new Error("EVENT_GAP");
      }
      next = event.sequence;
    }
    if (result.cursor !== next) {
      this.snapshotRequired = true;
      this.status("Backend snapshot required — waiting");
      throw new Error("EVENT_GAP");
    }
    for (const event of result.events)
      if (event.sequence > this.cursor) this.render(event);
    this.cursor = next;
    this.connected = true;
    return result;
  }
  available(): boolean {
    return this.connected;
  }
}
