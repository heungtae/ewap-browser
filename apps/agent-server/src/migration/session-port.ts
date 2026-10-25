import {
  migrationUnits,
  migrationOwnerAckSchema,
} from "../../../../packages/shared/src/migration.js";
import type { BrowserMigrationPort } from "../../../../packages/shared/src/migration-ports.js";
import { MigrationJournal, manifestDigest } from "./journal.js";
import type { Mg01SettingsMigration } from "./mg01-settings.js";
import type { Journal, MigrationPort, Unit } from "./coordinator.js";
export class ComposedMigrationPort implements MigrationPort {
  private pending: { epoch: number; unknownDispatches: number } | undefined;
  constructor(
    readonly journal: MigrationJournal,
    readonly browser: BrowserMigrationPort,
    readonly settings: Mg01SettingsMigration,
    private readonly compatible: (release: string) => Promise<boolean>,
  ) {
    if (browser.profileGuard !== settings.profileGuard)
      throw new Error("MIGRATION_PROFILE");
  }
  read() {
    return Promise.resolve(this.journal.read());
  }
  async write(expected: number | undefined, next: Journal) {
    await this.guard(next.epoch);
    this.journal.write(expected, next);
  }
  async guard(epoch: number) {
    const state = this.journal.state();
    if (state.epoch !== epoch || state.admission !== 0)
      throw new Error("MIGRATION_FENCE");
    await this.browser.assertFrozen(epoch);
  }
  async begin() {
    const epoch = this.journal.fence();
    const result = await this.browser.freezeAndDrain(epoch);
    if (!result.ready || result.unknownDispatches !== 0)
      throw new Error("DISPATCH_UNCERTAIN");
    this.pending = { epoch, unknownDispatches: 0 };
    return epoch;
  }
  async freezeAndDrain() {
    if (this.pending) {
      const result = this.pending;
      this.pending = undefined;
      await this.guard(result.epoch);
      return result;
    }
    const epoch = await this.begin();
    this.pending = undefined;
    return { epoch, unknownDispatches: 0 };
  }
  private epoch() {
    const epoch = this.journal.read()?.epoch ?? this.pending?.epoch;
    if (!epoch) throw new Error("MIGRATION_MISSING");
    return epoch;
  }
  async snapshotDigest(unit: Unit) {
    const epoch = this.epoch();
    await this.guard(epoch);
    const observed = await this.browser.sourceDigest(unit, epoch);
    if (
      unit === "MG01" &&
      (await this.settings.sourceDigest(epoch)) !== observed
    )
      throw new Error("SOURCE_CHANGED");
    return observed;
  }
  async copyToStaging(unit: Unit, manifest: Journal["manifest"]) {
    const epoch = this.epoch();
    await this.guard(epoch);
    return unit === "MG01"
      ? this.settings.stage(
          manifest.migrationId,
          epoch,
          manifest.sourceDigests.MG01,
        )
      : this.browser.stage(unit, manifest, epoch);
  }
  async validateStaging(
    unit: Unit,
    checkpoint: NonNullable<Journal["stores"][Unit]>,
  ) {
    const view = this.journal.read();
    if (!view) throw new Error("MIGRATION_MISSING");
    await this.guard(view.epoch);
    return unit === "MG01"
      ? this.settings.validate(
          view.manifest.migrationId,
          view.epoch,
          checkpoint,
        )
      : this.browser.validate(
          unit,
          view.manifest.migrationId,
          view.epoch,
          checkpoint,
        );
  }
  async validateAll(view: Journal) {
    if (view.manifest.profileGuard !== this.browser.profileGuard)
      throw new Error("MIGRATION_PROFILE");
    await this.guard(view.epoch);
    for (const unit of migrationUnits) {
      const checkpoint = view.stores[unit];
      if (
        !checkpoint ||
        (await this.snapshotDigest(unit)) !== checkpoint.sourceDigest ||
        !(await this.validateStaging(unit, checkpoint))
      )
        throw new Error("STAGING_INVALID");
    }
    await this.guard(view.epoch);
  }
  async assertOwnerAck(view: Journal) {
    const ack = migrationOwnerAckSchema.parse(
      await this.browser.acknowledge(view),
    );
    if (
      ack.owner !== "extension" ||
      ack.profileGuard !== this.browser.profileGuard ||
      ack.migrationId !== view.manifest.migrationId ||
      ack.epoch !== view.epoch ||
      ack.manifestDigest !== manifestDigest(view.manifest, view.stores)
    )
      throw new Error("MIGRATION_ACK_MISMATCH");
  }
  async activate(view: Journal, namespace: "legacy" | "target") {
    if (namespace === "target") {
      await this.validateAll(view);
      if (!(await this.browser.verifyAcknowledgment(view)))
        throw new Error("ACK_REQUIRED");
    }
    await this.guard(view.epoch);
    this.journal.activate(view, namespace);
  }
  compatibleRelease(release: string) {
    return this.compatible(release);
  }
}
