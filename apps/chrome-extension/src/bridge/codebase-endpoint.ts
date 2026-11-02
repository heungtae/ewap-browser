import { CodebaseInbox } from "./codebase-inbox.js";
import { waitForProjection } from "../codebase/projection-wait.js";
import {
  digest,
  projectionRequestSchema,
  projectionCancelSchema,
  canonical,
  type ProjectionLease,
  type ProjectionRequest,
  type ProjectionErrorCode,
} from "@contextpilot/codebase-schema";
import type { CodebaseReadService } from "@contextpilot/codebase-repository";
import {
  ProjectionRegistry,
  type ProjectionAdmission,
} from "../codebase/projection-registry.js";
import { pairedCodebaseProfile } from "../codebase/profile-scope.js";
import type { NativeSender, NativeIdentity, Pairing } from "./native-types.js";
import { sendProjection } from "./codebase-transfer.js";
export class CodebaseEndpoint {
  private inbox: CodebaseInbox;
  private registry: Promise<ProjectionRegistry>;
  private ready: Promise<void> | undefined;
  private identity: NativeIdentity | undefined;
  private stopped = false;
  private queued = 0;
  private seen = new Map<string, string>();
  private controllers = new Map<string, AbortController>();
  private serial = Promise.resolve();
  constructor(
    private sender: NativeSender,
    pairing: Pairing,
    private fail: () => void,
  ) {
    this.inbox = new CodebaseInbox(
      pairing,
      (payload, identity) => this.receive(payload, identity),
      fail,
    );
    this.registry = digest(
      pairedCodebaseProfile(pairing.installationId, pairing.profileId),
    ).then(
      (guard) =>
        new ProjectionRegistry(guard, Date.now, (id) => {
          if (!this.stopped)
            void sender
              .request({ kind: "codebase.revoke", leaseId: id } as {
                kind: string;
              })
              .catch(fail);
        }),
    );
    void this.registry.catch(fail);
  }
  attach(identity: NativeIdentity, capabilities: ReadonlySet<string>) {
    if (!capabilities.has("codebase.read")) return;
    this.identity = { ...identity };
    this.ready = this.registry
      .then(() =>
        this.sender.request({ kind: "codebase.attach", version: 1 } as {
          kind: string;
        }),
      )
      .then((value) => {
        if (
          !value ||
          typeof value !== "object" ||
          canonical(value) !==
            canonical({ kind: "codebase.attached", version: 1 })
        )
          throw Error("PROJECTION_UNAVAILABLE");
      });
    void this.ready.catch(this.fail);
  }
  async publish(
    read: CodebaseReadService,
    admission: ProjectionAdmission,
  ): Promise<ProjectionLease> {
    if (!this.ready || this.stopped) throw Error("PROJECTION_UNAVAILABLE");
    await this.ready;
    const registry = await this.registry,
      lease = await registry.install(read, admission);
    try {
      const result = await this.sender.request({
        kind: "codebase.offer",
        lease,
      } as { kind: string });
      if (
        this.stopped ||
        canonical(result) !==
          canonical({ kind: "codebase.offered", leaseId: lease.id })
      )
        throw Error("PROJECTION_UNAVAILABLE");
      await registry.validate(lease.id);
      return lease;
    } catch (error) {
      registry.revoke(lease.id);
      throw error;
    }
  }
  receiveAgent(raw: unknown, identity: NativeIdentity) {
    this.inbox.accept(raw, identity);
  }
  private receive(raw: unknown, identity: NativeIdentity) {
    if ((raw as { kind?: string })?.kind === "codebase.cancel") {
      const cancel = projectionCancelSchema.parse(raw);
      if (
        this.stopped ||
        cancel.connectionId !== identity.connectionId ||
        cancel.connectionEpoch !== identity.connectionEpoch ||
        this.seen.get(cancel.requestId) !== cancel.leaseId
      )
        throw Error("PROJECTION_PROTOCOL");
      this.controllers.get(cancel.requestId)?.abort();
      void this.registry
        .then((registry) => registry.revoke(cancel.leaseId))
        .catch(this.fail);
      return;
    }
    const request = projectionRequestSchema.parse(raw);
    if (
      this.stopped ||
      !this.ready ||
      !this.identity ||
      canonical(this.identity) !== canonical(identity) ||
      request.connectionId !== identity.connectionId ||
      request.connectionEpoch !== identity.connectionEpoch ||
      this.queued >= 4 ||
      this.seen.has(request.requestId) ||
      this.seen.size >= 128 ||
      request.deadline > Date.now() + 10000
    )
      throw Error("PROJECTION_PROTOCOL");
    this.seen.set(request.requestId, request.leaseId);
    this.controllers.set(request.requestId, new AbortController());
    this.queued++;
    this.serial = this.serial
      .then(() => this.process(request))
      .catch(this.fail)
      .finally(() => {
        this.controllers.delete(request.requestId);
        this.queued--;
      });
  }
  private async process(request: ProjectionRequest) {
    const registry = await this.registry;
    const active = () => {
      if (
        this.stopped ||
        this.controllers.get(request.requestId)?.signal.aborted ||
        Date.now() >= request.deadline
      )
        throw Error("PROJECTION_CANCELLED");
      registry.check(request.leaseId);
    };
    try {
      active();
      const packet = await waitForProjection(
        registry.project(request),
        request.deadline,
        () => registry.revoke(request.leaseId),
        this.controllers.get(request.requestId)?.signal,
      );
      await sendProjection(this.sender, request, packet, active, () =>
        registry.validate(request.leaseId),
      );
    } catch (error) {
      if (this.stopped) return;
      const allowed: ProjectionErrorCode[] = [
        "PROJECTION_DENIED",
        "PROJECTION_STALE",
        "PROJECTION_LIMIT",
        "PROJECTION_CANCELLED",
      ];
      const message = error instanceof Error ? error.message : "";
      const code = allowed.includes(message as ProjectionErrorCode)
        ? (message as ProjectionErrorCode)
        : "PROJECTION_UNAVAILABLE";
      await this.sender.request({
        kind: "codebase.reject",
        requestId: request.requestId,
        leaseId: request.leaseId,
        code,
      } as { kind: string });
    }
  }
  close() {
    if (this.stopped) return;
    this.stopped = true;
    this.inbox.close();
    for (const c of this.controllers.values()) c.abort();
    this.controllers.clear();
    this.identity = undefined;
    void this.registry
      .then((registry) => registry.clear())
      .catch(() => undefined);
  }
}
