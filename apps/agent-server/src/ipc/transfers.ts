import { ChunkTransfer } from "./transfer.js";
import { transferCommandSchema } from "@contextpilot/shared/bridge";
export class ConnectionTransfers {
  private active: ChunkTransfer | undefined;
  private finished = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  handle(input: unknown, now: number): { state: string; bytes?: number } {
    const command = transferCommandSchema.parse(input);
    if (command.kind === "transfer.open") {
      if (
        this.active ||
        this.finished.has(command.id) ||
        this.finished.size >= 128
      )
        throw new Error("TRANSFER_ORDER");
      this.active = new ChunkTransfer(command, now);
      this.timer = setTimeout(() => this.cancel(), command.deadline - now);
      this.timer.unref();
      return { state: "opened" };
    }
    const t = this.active;
    if (!t || t.spec.id !== command.id) throw new Error("TRANSFER_UNKNOWN");
    try {
      if (command.kind === "transfer.chunk")
        t.receive(command.index, Buffer.from(command.base64, "base64"), now);
      else if (command.kind === "transfer.ack") t.ack(command.index, now);
      else if (command.kind === "transfer.complete") {
        const trusted = t.complete(now);
        this.cancel();
        // No task consumer is admitted in S28. A verified transfer alone grants no authority.
        return { state: "verified", bytes: trusted.length };
      } else this.cancel();
      return {
        state: command.kind === "transfer.chunk" ? "received" : "acknowledged",
      };
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  cancel(): void {
    if (this.active) {
      this.finished.add(this.active.spec.id);
      this.active.cancel();
    }
    clearTimeout(this.timer);
    this.active = undefined;
  }
}
