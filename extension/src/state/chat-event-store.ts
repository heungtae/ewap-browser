import type { ChatEvent, ChatEventPayload } from "../contracts/chat-events.js";
import { fail } from "../security/validation.js";

type Stream = { next: number; terminal: boolean; events: ChatEvent[] };

/** Bounded, sequence-addressable UI projection. Provider payloads never enter it. */
export class ChatEventStore {
  private readonly streams = new Map<string, Stream>();

  public has(runId: string): boolean {
    return this.streams.has(runId);
  }

  public terminal(runId: string): boolean {
    return this.streams.get(runId)?.terminal === true;
  }

  public append(runId: string, payload: ChatEventPayload): ChatEvent {
    const stream = this.streams.get(runId) ?? {
      next: 1,
      terminal: false,
      events: [],
    };
    if (stream.terminal) return fail("INVALID_ARGUMENT");
    const event = {
      ...payload,
      run_id: runId,
      sequence: stream.next++,
    } as ChatEvent;
    stream.events.push(event);
    if (payload.type === "run_terminal") stream.terminal = true;
    // Keep enough history for a panel reconnect without retaining an unbounded transcript.
    if (stream.events.length > 2_000)
      stream.events.splice(0, stream.events.length - 2_000);
    this.streams.set(runId, stream);
    return structuredClone(event);
  }

  public since(runId: string, sequence = 0): ChatEvent[] {
    const stream = this.streams.get(runId);
    if (!stream || !Number.isInteger(sequence) || sequence < 0)
      return fail("INVALID_ARGUMENT");
    return stream.events
      .filter((event) => event.sequence > sequence)
      .map((event) => structuredClone(event));
  }

  public snapshot(runId: string): {
    next_sequence: number;
    terminal: boolean;
    events: ChatEvent[];
  } {
    const stream = this.streams.get(runId);
    if (!stream) return fail("INVALID_ARGUMENT");
    return {
      next_sequence: stream.next,
      terminal: stream.terminal,
      events: stream.events.map((event) => structuredClone(event)),
    };
  }
}
