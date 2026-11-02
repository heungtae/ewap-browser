import { codebaseAgentSchema } from "@contextpilot/shared/bridge";
import { wireDigest } from "./native-auth.js";
import type { Pairing, NativeIdentity } from "./native-types.js";
export class CodebaseInbox {
  private seen = new Set<string>();
  private queued = 0;
  private serial = Promise.resolve();
  private stopped = false;
  constructor(
    private pairing: Pairing,
    private receive: (payload: unknown, identity: NativeIdentity) => void,
    private fail: () => void,
  ) {}
  accept(raw: unknown, identity: NativeIdentity) {
    if (this.stopped || this.queued >= 8) throw Error("PROJECTION_PROTOCOL");
    this.queued++;
    this.serial = this.serial
      .then(async () => {
        const frame = codebaseAgentSchema.parse(raw),
          now = Date.now();
        if (
          this.stopped ||
          frame.connectionId !== identity.connectionId ||
          frame.connectionEpoch !== identity.connectionEpoch ||
          frame.installationId !== this.pairing.installationId ||
          frame.profileId !== this.pairing.profileId ||
          frame.deadline <= now ||
          frame.deadline > now + 10000 ||
          frame.sentAt > now + 1000 ||
          frame.sentAt < now - 10000 ||
          this.seen.has(frame.messageId) ||
          this.seen.size >= 256 ||
          (await wireDigest(frame.payload)) !== frame.payloadDigest ||
          ("deadline" in frame.payload &&
            frame.payload.deadline !== frame.deadline)
        )
          throw Error("PROJECTION_PROTOCOL");
        this.seen.add(frame.messageId);
        if (!this.stopped) this.receive(frame.payload, identity);
      })
      .catch(this.fail)
      .finally(() => {
        this.queued--;
      });
  }
  close() {
    this.stopped = true;
    this.seen.clear();
  }
}
