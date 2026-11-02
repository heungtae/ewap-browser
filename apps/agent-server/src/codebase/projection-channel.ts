import { codebaseCommandSchema } from "@contextpilot/shared/bridge";
import { ProjectionPending } from "./projection-pending.js";
import { randomUUID } from "node:crypto";
import {
  canonical,
  projectionLeaseSchema,
  projectionOperationSchema,
  projectionErrorCodeSchema,
  type ProjectionLease,
  type ProjectionRequest,
  type ProjectionOperation,
  type ProjectionPacket,
} from "@contextpilot/codebase-schema";
import { validateProjection } from "./projection-validation.js";
export interface ProjectionConnection {
  connectionId: string;
  connectionEpoch: number;
}
export interface ProjectionReadOptions {
  deadline: number;
  signal: AbortSignal;
  maxBytes: number;
}
export class ProjectionChannel {
  private attached = false;
  private closed = false;
  private offers = new Map<string, ProjectionLease>();
  private pending: ProjectionPending;
  constructor(
    readonly identity: ProjectionConnection,
    private profileGuard: string,
    private send: (value: unknown) => void,
    private offered: (
      channel: ProjectionChannel,
      lease: ProjectionLease,
    ) => void,
    private now = Date.now,
  ) {
    this.pending = new ProjectionPending(send);
  }
  command(raw: unknown) {
    const value = codebaseCommandSchema.parse(raw);
    if (this.closed) throw Error("PROJECTION_UNAVAILABLE");
    if (value.kind === "codebase.attach") {
      if (this.attached || value.version !== 1)
        throw Error("PROJECTION_PROTOCOL");
      this.attached = true;
      return { kind: "codebase.attached", version: 1 };
    }
    if (!this.attached) throw Error("PROJECTION_UNAVAILABLE");
    if (value.kind === "codebase.offer") {
      const lease = projectionLeaseSchema.parse(value.lease);
      if (
        lease.scope.profileGuard !== this.profileGuard ||
        lease.expiresAt <= this.now() ||
        lease.expiresAt > this.now() + 600000 ||
        this.offers.has(lease.id) ||
        this.offers.size >= 32
      )
        throw Error("PROJECTION_DENIED");
      this.offers.set(lease.id, lease);
      this.offered(this, structuredClone(lease));
      return { kind: "codebase.offered", leaseId: lease.id };
    }
    if (value.kind === "codebase.revoke") {
      this.offers.delete(value.leaseId!);
      this.pending.revoke(value.leaseId);
      return { kind: "codebase.revoked", leaseId: value.leaseId };
    }
    if (value.kind !== "codebase.reject") throw Error("PROJECTION_PROTOCOL");
    const pending = this.pending.get(value.requestId!);
    if (
      pending
        ? pending.request.leaseId !== value.leaseId
        : this.pending.retiredLease(value.requestId!) !== value.leaseId
    )
      throw Error("PROJECTION_PROTOCOL");
    this.pending.reject(
      value.requestId!,
      Error(projectionErrorCodeSchema.parse(value.code)),
    );
    return { kind: "codebase.rejected", requestId: value.requestId };
  }
  leases() {
    return [...this.offers.values()]
      .filter((l) => l.expiresAt > this.now())
      .map((l) => structuredClone(l));
  }
  read(
    leaseId: string,
    raw: ProjectionOperation,
    options: ProjectionReadOptions,
  ): Promise<ProjectionPacket> {
    const operation = projectionOperationSchema.parse(raw),
      lease = this.offers.get(leaseId),
      now = this.now();
    if (
      this.closed ||
      !this.attached ||
      !lease ||
      lease.expiresAt <= now ||
      options.signal.aborted ||
      options.deadline <= now
    )
      throw Error("PROJECTION_UNAVAILABLE");
    if (
      !Number.isSafeInteger(options.maxBytes) ||
      options.maxBytes < 1 ||
      options.maxBytes > 8 * 1024 * 1024
    )
      throw Error("PROJECTION_LIMIT");
    this.pending.check();
    const p = lease.permissions;
    if (operation.kind === "search" || operation.kind === "inspect") {
      if (
        !p.graph ||
        (operation.kind === "inspect" && operation.includeSample && !p.samples)
      )
        throw Error("PROJECTION_DENIED");
    } else if (
      !p.datasets.some(
        (d) => d.id === operation.id && d.digest === operation.digest,
      )
    )
      throw Error("PROJECTION_DENIED");
    const request: ProjectionRequest = {
      schema: "wca.codebase-projection/v1",
      kind: "codebase.request",
      requestId: randomUUID(),
      ...this.identity,
      leaseId,
      scope: structuredClone(lease.scope),
      operation,
      deadline: Math.min(options.deadline, lease.expiresAt, now + 10000),
      maxBytes: options.maxBytes,
    };
    const result = this.pending.open(request, options.signal, now);
    try {
      this.send(request);
    } catch {
      this.pending.reject(request.requestId, Error("PROJECTION_UNAVAILABLE"));
    }
    return result;
  }
  expects(id: string) {
    return this.pending.has(id);
  }
  complete(id: string, bytes: Buffer) {
    const pending = this.pending.get(id);
    if (!pending) {
      if (this.pending.retiredLease(id) !== undefined) return;
      throw Error("PROJECTION_PROTOCOL");
    }
    const lease = this.offers.get(pending.request.leaseId);
    if (
      !lease ||
      this.now() >= pending.request.deadline ||
      lease.expiresAt <= this.now() ||
      pending.signal.aborted ||
      this.closed
    ) {
      this.pending.reject(id, Error("PROJECTION_STALE"));
      return;
    }
    try {
      const packet = validateProjection(bytes, pending.request, this.now());
      if (
        packet.expiresAt > lease.expiresAt ||
        canonical(packet.scope) !== canonical(lease.scope)
      )
        throw Error("PROJECTION_STALE");
      this.pending.resolve(id, packet);
    } catch (error) {
      this.pending.reject(id, Error("PROJECTION_INTEGRITY"));
      throw error;
    }
  }
  suspend() {
    this.offers.clear();
    this.pending.clear();
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.suspend();
  }
}
