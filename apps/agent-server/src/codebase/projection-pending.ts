import type {
  ProjectionRequest,
  ProjectionPacket,
} from "@contextpilot/codebase-schema";
interface Pending {
  request: ProjectionRequest;
  resolve: (value: ProjectionPacket) => void;
  reject: (error: Error) => void;
  stop: () => void;
  timer: ReturnType<typeof setTimeout>;
  signal: AbortSignal;
}
export class ProjectionPending {
  constructor(private send: (value: unknown) => void) {}
  private active = new Map<string, Pending>();
  private retired = new Map<string, string>();
  check() {
    if (this.active.size >= 4 || this.retired.size >= 128)
      throw Error("PROJECTION_LIMIT");
  }
  get(id: string) {
    return this.active.get(id);
  }
  has(id: string) {
    return this.active.has(id);
  }
  retiredLease(id: string) {
    return this.retired.get(id);
  }
  open(request: ProjectionRequest, signal: AbortSignal, now: number) {
    this.check();
    return new Promise<ProjectionPacket>((resolve, reject) => {
      const stop = () => {
        this.reject(request.requestId, Error("PROJECTION_CANCELLED"));
        try {
          this.send({
            schema: "wca.codebase-projection/v1",
            kind: "codebase.cancel",
            requestId: request.requestId,
            leaseId: request.leaseId,
            connectionId: request.connectionId,
            connectionEpoch: request.connectionEpoch,
          });
        } catch {
          /* disconnected: the result stays cancelled */
        }
      };
      const timer = setTimeout(stop, request.deadline - now);
      timer.unref();
      this.active.set(request.requestId, {
        request,
        resolve,
        reject,
        stop,
        timer,
        signal,
      });
      signal.addEventListener("abort", stop, { once: true });
    });
  }
  private release(id: string) {
    const p = this.active.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    p.signal.removeEventListener("abort", p.stop);
    this.active.delete(id);
    this.retired.set(id, p.request.leaseId);
    return p;
  }
  resolve(id: string, packet: ProjectionPacket) {
    this.release(id)?.resolve(packet);
  }
  reject(id: string, error: Error) {
    this.release(id)?.reject(error);
  }
  revoke(leaseId: string) {
    for (const [id, p] of this.active)
      if (p.request.leaseId === leaseId)
        this.reject(id, Error("PROJECTION_STALE"));
  }
  clear() {
    for (const id of [...this.active.keys()])
      this.reject(id, Error("PROJECTION_UNAVAILABLE"));
  }
}
