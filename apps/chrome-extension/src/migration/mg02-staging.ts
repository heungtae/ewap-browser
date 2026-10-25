import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import {
  request,
  completed,
} from "../../../../packages/codebase-repository/src/database.js";
import {
  mg02SourceKeys,
  mg02MirrorSchema,
  mg02AckSchema,
  type PolicyMirror,
  type PolicyMirrorPort,
  type PolicyMirrorAck,
} from "../../../../packages/policy-engine/src/migration-contract.js";
import { LocalStaging, type FrozenSource } from "./local-staging.js";
import { legacyStagingForCoordinator } from "./coordinator-staging.js";
import { migrationDigest } from "./migration-digest.js";
import { convertMg02, type PolicySourceSnapshot } from "./mg02-convert.js";
export class Mg02Staging {
  private readonly local: LocalStaging<
    PolicySourceSnapshot,
    ReturnType<typeof convertMg02>
  >;
  private readonly coordinator;
  private readonly profileGuard: string;
  constructor(
    private readonly db: IDBDatabase,
    private readonly source: FrozenSource,
  ) {
    const match = /^contextpilot-codebase-v1-([a-f0-9]{64})$/.exec(db.name);
    if (!match) throw new Error("MG02_PROFILE");
    this.profileGuard = match[1]!;
    this.local = new LocalStaging(db, source, {
      unit: "MG02",
      schema: "wca.mg02-stage/v1",
      sourceKeys: mg02SourceKeys,
      convert: convertMg02,
    });
    this.coordinator = legacyStagingForCoordinator(this.local);
  }
  sourceDigest(epoch: number) {
    return this.coordinator.sourceDigest(epoch);
  }
  stage(id: string, epoch: number, digest: string) {
    return this.coordinator.stage(id, epoch, digest);
  }
  validate(
    id: string,
    epoch: number,
    checkpoint: Parameters<typeof this.coordinator.validate>[2],
  ) {
    return this.coordinator.validate(id, epoch, checkpoint);
  }
  private async payload(
    id: string,
    epoch: number,
    profileGuard: string,
  ): Promise<PolicyMirror> {
    if (profileGuard !== this.profileGuard) throw new Error("MG02_PROFILE");
    const row = await this.local.read(id);
    if (!row) throw new Error("MG02_STAGE_MISSING");
    const checkpoint = {
      ...row.checkpoint,
      sourceDigest: migrationDigest(row.snapshot),
      targetDigest: migrationDigest(row.conversion),
    };
    if (!(await this.validate(id, epoch, checkpoint)))
      throw new Error("MG02_STAGE_STALE");
    return mg02MirrorSchema.parse({
      schema: "wca.mg02-mirror/v1",
      migrationId: id,
      profileGuard,
      epoch,
      policyRevision: row.conversion.preferences.policyRevision,
      conversion: row.conversion,
      checkpoint,
    });
  }
  private matches(ack: PolicyMirrorAck, value: PolicyMirror) {
    return (
      ack.profileGuard === value.profileGuard &&
      ack.migrationId === value.migrationId &&
      ack.epoch === value.epoch &&
      ack.policyRevision === value.policyRevision &&
      ack.manifestDigest === migrationDigest(value)
    );
  }
  // Backend port must be authenticated by profile/channel ownership, not supplied
  // by a provider message. Neither side opens admission or installs active policy.
  async mirror(
    id: string,
    epoch: number,
    profileGuard: string,
    backend: PolicyMirrorPort,
  ) {
    const value = await this.payload(id, epoch, profileGuard);
    const ack = mg02AckSchema.parse(await backend.put(value));
    if (!this.matches(ack, value)) throw new Error("MG02_MIRROR_MISMATCH");
    const current = await this.payload(id, epoch, profileGuard);
    if (canonicalJson(current) !== canonicalJson(value))
      throw new Error("MG02_STAGE_STALE");
    await this.source.assertFrozen(epoch);
    const tx = this.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    try {
      const stored = await request(
        tx.objectStore("migrationJournal").get(JSON.stringify(["MG02", id])),
      );
      if (
        !stored ||
        migrationDigest(stored.conversion) !== value.checkpoint.targetDigest ||
        stored.epoch !== epoch
      )
        throw new Error("MG02_STAGE_STALE");
      tx.objectStore("migrationJournal").put({
        key: JSON.stringify(["MG02-ack", id]),
        ...ack,
      });
      await done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already completed. */
      }
      await done.catch(() => undefined);
      throw error;
    }
    await this.source.assertFrozen(epoch);
    return ack;
  }
  async validateMirror(
    id: string,
    epoch: number,
    profileGuard: string,
    backend: PolicyMirrorPort,
  ) {
    const value = await this.payload(id, epoch, profileGuard);
    const remote = await backend.read(profileGuard, id, epoch);
    if (!remote) return false;
    const tx = this.db.transaction("migrationJournal", "readonly");
    const done = completed(tx);
    const saved = await request(
      tx.objectStore("migrationJournal").get(JSON.stringify(["MG02-ack", id])),
    );
    await done;
    await this.source.assertFrozen(epoch);
    const current = await this.payload(id, epoch, profileGuard);
    if (canonicalJson(current) !== canonicalJson(value)) return false;
    const local = mg02AckSchema.safeParse(
      saved
        ? Object.fromEntries(
            Object.entries(saved).filter(([key]) => key !== "key"),
          )
        : undefined,
    );
    return (
      local.success &&
      this.matches(local.data, value) &&
      this.matches(mg02AckSchema.parse(remote), value)
    );
  }
}
