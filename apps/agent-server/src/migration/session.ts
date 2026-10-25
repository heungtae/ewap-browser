import { units, MigrationCoordinator, type Manifest } from "./coordinator.js";
import { manifestDigest } from "./journal.js";
import { ComposedMigrationPort } from "./session-port.js";
export class MigrationSession {
  private readonly coordinator: MigrationCoordinator;
  constructor(private readonly port: ComposedMigrationPort) {
    this.coordinator = new MigrationCoordinator(port, manifestDigest);
    const old = port.journal.read();
    if (old && old.manifest.profileGuard !== port.browser.profileGuard)
      throw new Error("MIGRATION_PROFILE");
  }
  async prepare(
    input: Pick<Manifest, "migrationId" | "legacyRelease" | "targetRelease">,
  ) {
    const old = this.port.journal.read();
    if (old) {
      if (
        old.manifest.migrationId !== input.migrationId ||
        old.manifest.legacyRelease !== input.legacyRelease ||
        old.manifest.targetRelease !== input.targetRelease
      )
        throw new Error("MIGRATION_CONFLICT");
      await this.port.guard(old.epoch);
      return this.coordinator.prepare(old.manifest);
    }
    await this.port.begin();
    const digests = await Promise.all(
      units.map(
        async (unit) => [unit, await this.port.snapshotDigest(unit)] as const,
      ),
    );
    return this.coordinator.prepare({
      ...input,
      profileGuard: this.port.browser.profileGuard,
      sourceSchemas:
        "legacy-settings-v1-v2/permissions/workflow/chat/requests/diagnostics",
      targetSchemas: "wca.migration/v1",
      sourceDigests: Object.fromEntries(digests) as Manifest["sourceDigests"],
    });
  }
  copy() {
    return this.coordinator.copy();
  }
  async acknowledge() {
    let view = this.port.journal.read();
    if (!view || view.phase !== "validated") throw new Error("STAGING_INVALID");
    await this.port.validateAll(view);
    await this.port.assertOwnerAck(view);
    const digest = manifestDigest(view.manifest, view.stores);
    await this.coordinator.acknowledge("extension", digest, view.epoch);
    view = this.port.journal.read()!;
    await this.port.validateAll(view);
    if (!(await this.port.browser.verifyAcknowledgment(view)))
      throw new Error("ACK_REQUIRED");
    return this.coordinator.acknowledge("backend", digest, view.epoch);
  }
  async commit() {
    const view = this.port.journal.read();
    if (!view) throw new Error("MIGRATION_MISSING");
    await this.port.validateAll(view);
    const digest = manifestDigest(view.manifest, view.stores);
    if (
      view.acknowledgments.extension !== digest ||
      view.acknowledgments.backend !== digest ||
      !(await this.port.browser.verifyAcknowledgment(view))
    )
      throw new Error("ACK_REQUIRED");
    if (
      view.phase === "committed" &&
      this.port.journal.state().namespace !== "target"
    )
      throw new Error("MIGRATION_POINTER_MISMATCH");
    await this.coordinator.commit();
  }
  rollback() {
    return this.coordinator.rollback();
  }
}
