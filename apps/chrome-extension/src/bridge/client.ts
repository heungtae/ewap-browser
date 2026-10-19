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
    const result = await this.transport.request("resumeEvents", afterSequence);
    if (result.resync) {
      this.cursor = result.cursor;
      this.status("Backend snapshot required — waiting");
    } else
      for (const event of result.events) {
        if (event.sequence <= this.cursor) continue;
        if (event.sequence !== this.cursor + 1) throw new Error("EVENT_GAP");
        this.render(event);
        this.cursor = event.sequence;
      }
    this.connected = true;
    return result;
  }
  available(): boolean {
    return this.connected;
  }
}
