import {
  CodebaseProjector,
  type CodebaseReadService,
} from "@contextpilot/codebase-repository";
import {
  canonical,
  digest,
  bytes,
  projectionLeaseSchema,
  projectionRequestSchema,
  projectionPacketSchema,
  type ProjectionLease,
  type ProjectionRequest,
  type ProjectionPacket,
  type Snapshot,
} from "@contextpilot/codebase-schema";
export interface ProjectionAdmission {
  runtimeEpoch: number;
  documentId: string;
  deadline: number;
  signal: AbortSignal;
  permissions: ProjectionLease["permissions"];
  current(): boolean;
}
interface Entry {
  lease: ProjectionLease;
  projector: CodebaseProjector;
  admission: ProjectionAdmission;
  stop: () => void;
  timer: ReturnType<typeof setTimeout>;
}
export class ProjectionRegistry {
  private entries = new Map<string, Entry>();
  constructor(
    private profileGuard: string,
    private now = Date.now,
    private invalidated: (id: string) => void = () => {},
  ) {}
  private scope(snapshot: Snapshot, admission: ProjectionAdmission) {
    return {
      repositoryId: snapshot.repositoryId,
      profileGuard: snapshot.context.profileGuard,
      partitionId: snapshot.partitionId,
      pageKey: snapshot.pageKey,
      taskId: snapshot.context.taskId,
      runtimeEpoch: admission.runtimeEpoch,
      revision: snapshot.revision,
      graphDigest: snapshot.digest,
      source: snapshot.context.source,
      documentId: admission.documentId,
    };
  }
  async install(
    read: CodebaseReadService,
    input: ProjectionAdmission,
  ): Promise<ProjectionLease> {
    if (this.entries.size >= 32) throw Error("PROJECTION_LIMIT");
    const admission = {
      ...input,
      permissions: structuredClone(input.permissions),
    };
    if (
      !admission.current() ||
      admission.signal.aborted ||
      admission.deadline <= this.now() ||
      admission.deadline > this.now() + 600000
    )
      throw Error("PROJECTION_DENIED");
    const projector = new CodebaseProjector(read),
      snapshot = await projector.catalog();
    if (snapshot.context.profileGuard !== this.profileGuard)
      throw Error("PROJECTION_DENIED");
    const lease = projectionLeaseSchema.parse({
      schema: "wca.codebase-projection/v1",
      kind: "lease",
      id: `lease_${crypto.randomUUID()}`,
      scope: this.scope(snapshot, admission),
      expiresAt: Math.min(admission.deadline, snapshot.expiresAt),
      permissions: admission.permissions,
    });
    if (
      !admission.current() ||
      admission.signal.aborted ||
      lease.expiresAt <= this.now() ||
      this.entries.size >= 32
    )
      throw Error("PROJECTION_STALE");
    const stop = () => this.revoke(lease.id);
    admission.signal.addEventListener("abort", stop, { once: true });
    const timer = setTimeout(stop, lease.expiresAt - this.now());
    this.entries.set(lease.id, { lease, projector, admission, stop, timer });
    return structuredClone(lease);
  }
  private active(id: string) {
    const entry = this.entries.get(id);
    if (!entry) throw Error("PROJECTION_DENIED");
    if (
      entry.admission.signal.aborted ||
      !entry.admission.current() ||
      entry.lease.expiresAt <= this.now()
    ) {
      this.revoke(id);
      throw Error("PROJECTION_STALE");
    }
    return entry;
  }
  check(id: string) {
    this.active(id);
  }
  async validate(id: string) {
    const entry = this.active(id),
      snapshot = await entry.projector.catalog();
    this.active(id);
    if (
      canonical(this.scope(snapshot, entry.admission)) !==
      canonical(entry.lease.scope)
    ) {
      this.revoke(id);
      throw Error("PROJECTION_STALE");
    }
    return entry;
  }
  private authorize(entry: Entry, request: ProjectionRequest) {
    if (
      canonical(entry.lease.scope) !== canonical(request.scope) ||
      request.deadline > entry.lease.expiresAt ||
      request.deadline <= this.now()
    )
      throw Error("PROJECTION_STALE");
    const operation = request.operation,
      p = entry.lease.permissions;
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
  }
  async project(raw: unknown): Promise<ProjectionPacket> {
    const request = projectionRequestSchema.parse(raw),
      entry = this.active(request.leaseId);
    this.authorize(entry, request);
    const payload = await entry.projector.project(request.operation, {
      revision: entry.lease.scope.revision,
      digest: entry.lease.scope.graphDigest,
    });
    const body = {
      schema: "wca.codebase-projection/v1" as const,
      kind: "projection" as const,
      requestId: request.requestId,
      leaseId: request.leaseId,
      scope: entry.lease.scope,
      operationDigest: await digest(request.operation),
      observedAt: this.now(),
      expiresAt: Math.min(
        request.deadline,
        entry.lease.expiresAt,
        payload.kind === "dataset"
          ? payload.dataset.expiresAt
          : payload.kind === "query"
            ? payload.result.expiresAt
            : entry.lease.expiresAt,
      ),
      payload,
    };
    const result = projectionPacketSchema.parse({
      ...body,
      digest: await digest(body),
    });
    if (bytes(result) > request.maxBytes) throw Error("PROJECTION_LIMIT");
    await this.validate(request.leaseId);
    if (this.now() >= request.deadline) throw Error("PROJECTION_CANCELLED");
    return result;
  }
  revoke(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    clearTimeout(entry.timer);
    entry.admission.signal.removeEventListener("abort", entry.stop);
    this.invalidated(id);
  }
  clear() {
    for (const id of [...this.entries.keys()]) this.revoke(id);
  }
}
