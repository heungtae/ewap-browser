import {
  migrationUnits,
  migrationJournalSchema,
  migrationOwnerAckSchema,
} from "../../../../packages/shared/src/migration.js";
import type {
  Journal,
  Manifest,
  Checkpoint,
  Unit,
} from "../../../../packages/shared/src/migration-types.js";
import type {
  BrowserMigrationPort,
  BrowserMigrationUnit,
} from "../../../../packages/shared/src/migration-ports.js";
import type { PolicyMirrorPort } from "../../../../packages/policy-engine/src/migration-contract.js";
import type { FrozenSource } from "./local-staging.js";
import { browserMigrationUnits } from "./owner-units.js";
import { MigrationOwnerAcks } from "./owner-ack.js";
import { drainLegacy, type LegacyDrainPort } from "./mg05-drain.js";
import { mg05Keys, type ExecutionSnapshot } from "./mg05-convert.js";
import { migrationDigest } from "./migration-digest.js";
export class BrowserMigrationOwner implements BrowserMigrationPort {
  readonly profileGuard: string;
  private readonly stages;
  private readonly acks;
  constructor(
    db: IDBDatabase,
    private readonly local: FrozenSource,
    private readonly session: FrozenSource,
    mirror: PolicyMirrorPort,
    private readonly lifecycle: {
      freeze(epoch: number): Promise<void>;
      drain: LegacyDrainPort;
    },
    now = Date.now,
  ) {
    const match = /^contextpilot-codebase-v1-([a-f0-9]{64})$/.exec(db.name);
    if (!match) throw new Error("MIGRATION_PROFILE");
    this.profileGuard = match[1]!;
    this.stages = browserMigrationUnits(
      db,
      local,
      session,
      mirror,
      this.profileGuard,
      now,
    );
    this.acks = new MigrationOwnerAcks(db);
  }
  async assertFrozen(epoch: number) {
    await this.local.assertFrozen(epoch);
    await this.session.assertFrozen(epoch);
  }
  async freezeAndDrain(epoch: number) {
    await this.lifecycle.freeze(epoch);
    await this.assertFrozen(epoch);
    const raw = await this.session.get([...mg05Keys]);
    const snapshot = Object.fromEntries(
      mg05Keys
        .filter((key) => Object.hasOwn(raw, key))
        .map((key) => [key, raw[key]]),
    ) as ExecutionSnapshot;
    const result = await drainLegacy(this.lifecycle.drain, snapshot, epoch);
    await this.assertFrozen(epoch);
    return { ready: result.ready, unknownDispatches: result.unknownDispatches };
  }
  async sourceDigest(unit: Unit, epoch: number) {
    await this.assertFrozen(epoch);
    if (unit !== "MG01") return this.stages[unit].sourceDigest(epoch);
    let raw: Record<string, unknown>;
    try {
      raw = await this.local.get(["provider_settings"]);
    } catch {
      throw new Error("MG01_SOURCE_UNAVAILABLE");
    }
    return migrationDigest({ provider_settings: raw.provider_settings });
  }
  async stage(unit: BrowserMigrationUnit, manifest: Manifest, epoch: number) {
    if (manifest.profileGuard !== this.profileGuard)
      throw new Error("MIGRATION_PROFILE");
    await this.assertFrozen(epoch);
    return this.stages[unit].stage(
      manifest.migrationId,
      epoch,
      manifest.sourceDigests[unit],
    );
  }
  async validate(
    unit: BrowserMigrationUnit,
    id: string,
    epoch: number,
    checkpoint: Checkpoint,
  ) {
    await this.assertFrozen(epoch);
    return this.stages[unit].validate(id, epoch, checkpoint);
  }
  private async validateView(raw: Journal) {
    const view = migrationJournalSchema.parse(raw) as Journal;
    if (
      view.manifest.profileGuard !== this.profileGuard ||
      !["validated", "committed"].includes(view.phase)
    )
      throw new Error("MIGRATION_ACK_SCOPE");
    await this.assertFrozen(view.epoch);
    for (const unit of migrationUnits) {
      const checkpoint = view.stores[unit];
      if (
        !checkpoint ||
        checkpoint.sourceDigest !== view.manifest.sourceDigests[unit] ||
        (await this.sourceDigest(unit, view.epoch)) !==
          checkpoint.sourceDigest ||
        (unit !== "MG01" &&
          !(await this.validate(
            unit,
            view.manifest.migrationId,
            view.epoch,
            checkpoint,
          )))
      )
        throw new Error("MIGRATION_ACK_STAGING");
    }
    await this.assertFrozen(view.epoch);
    return view;
  }
  async acknowledge(raw: Journal) {
    const view = await this.validateView(raw);
    const ack = migrationOwnerAckSchema.parse({
      schema: "wca.migration-ack/v1",
      owner: "extension",
      profileGuard: this.profileGuard,
      migrationId: view.manifest.migrationId,
      epoch: view.epoch,
      manifestDigest: migrationDigest({
        manifest: view.manifest,
        stores: view.stores,
      }),
    });
    await this.acks.save(ack);
    await this.assertFrozen(view.epoch);
    return ack;
  }
  async verifyAcknowledgment(raw: Journal) {
    const view = await this.validateView(raw);
    const ack = await this.acks.read(view.manifest.migrationId);
    return (
      !!ack &&
      ack.owner === "extension" &&
      ack.profileGuard === this.profileGuard &&
      ack.migrationId === view.manifest.migrationId &&
      ack.epoch === view.epoch &&
      ack.manifestDigest ===
        migrationDigest({ manifest: view.manifest, stores: view.stores })
    );
  }
}
