import { randomUUID } from "node:crypto";
import { digest as wireDigest } from "../ipc/session.js";
import {
  pairedCodebaseProfile,
  type ProjectionLease,
} from "@contextpilot/codebase-schema";
import { projectionHash } from "./projection-validation.js";
import { ProjectionChannel } from "./projection-channel.js";
import type { Session } from "../ipc/session.js";
export class ProjectionHub {
  private channels = new Map<string, ProjectionChannel>();
  private profileGuard: string;
  private profile: { installationId: string; profileId: string };
  constructor(
    profile: { installationId: string; profileId: string },
    private offered: (
      channel: ProjectionChannel,
      lease: ProjectionLease,
    ) => void = () => {},
  ) {
    this.profile = {
      installationId: profile.installationId,
      profileId: profile.profileId,
    };
    this.profileGuard = projectionHash(
      pairedCodebaseProfile(profile.installationId, profile.profileId),
    );
  }
  connect(session: Session, send: (value: unknown) => void) {
    if (
      session.pairing.installationId !== this.profile.installationId ||
      session.pairing.profileId !== this.profile.profileId ||
      this.channels.has(session.connectionId) ||
      this.channels.size >= 16
    )
      throw Error("PROJECTION_DENIED");
    const forward = (payload: unknown) =>
      send({
        kind: "codebase.agent",
        major: 1,
        minor: 0,
        messageId: randomUUID(),
        connectionId: session.connectionId,
        connectionEpoch: session.connectionEpoch,
        installationId: this.profile.installationId,
        profileId: this.profile.profileId,
        sender: "agent",
        sentAt: Date.now(),
        deadline:
          (payload as { deadline?: number }).deadline ?? Date.now() + 5000,
        payloadDigest: wireDigest(payload),
        payload,
      });
    const channel = new ProjectionChannel(
      {
        connectionId: session.connectionId,
        connectionEpoch: session.connectionEpoch,
      },
      this.profileGuard,
      forward,
      this.offered,
    );
    this.channels.set(session.connectionId, channel);
    return channel;
  }
  disconnect(id: string) {
    this.channels.get(id)?.close();
    this.channels.delete(id);
  }
  connections() {
    return [...this.channels.values()];
  }
}
