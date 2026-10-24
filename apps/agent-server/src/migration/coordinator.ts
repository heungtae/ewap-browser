export const units = ["MG01", "MG02", "MG03", "MG04", "MG05", "MG06"] as const;
export type Unit = (typeof units)[number];
export interface Manifest {
  migrationId: string;
  sourceSchemas: string;
  targetSchemas: string;
  sourceDigests: Record<Unit, string>;
  legacyRelease: string;
  targetRelease: string;
}
export interface Checkpoint {
  sourceDigest: string;
  targetDigest: string;
  copied: number;
  quarantined: number;
  sourceCount: number;
}
export interface Journal {
  manifest: Manifest;
  revision: number;
  epoch: number;
  phase: "prepared" | "copying" | "validated" | "committed" | "rolled_back";
  stores: Partial<Record<Unit, Checkpoint>>;
  acknowledgments: Partial<Record<"extension" | "backend", string>>;
}
// Implementations must persist journal and admission fence atomically in their own store.
// The active pointer CAS must check the same revision and both acknowledgments.
export interface MigrationPort {
  read(): Promise<Journal | undefined>;
  write(expectedRevision: number | undefined, next: Journal): Promise<void>;
  freezeAndDrain(): Promise<{ epoch: number; unknownDispatches: number }>;
  snapshotDigest(unit: Unit): Promise<string>;
  copyToStaging(unit: Unit, manifest: Manifest): Promise<Checkpoint>;
  validateStaging(unit: Unit, checkpoint: Checkpoint): Promise<boolean>;
  activate(journal: Journal, namespace: "legacy" | "target"): Promise<void>;
  compatibleRelease(release: string): Promise<boolean>;
}
export interface ManifestHasher {
  (manifest: Manifest, stores: Journal["stores"]): string;
}
export class MigrationCoordinator {
  constructor(
    private readonly port: MigrationPort,
    private readonly hash: ManifestHasher,
  ) {}
  private async save(current: Journal, patch: Partial<Journal>) {
    const next = { ...current, ...patch, revision: current.revision + 1 };
    await this.port.write(current.revision, next);
    return next;
  }
  async prepare(manifest: Manifest): Promise<Journal> {
    if (
      !manifest.migrationId ||
      !manifest.sourceSchemas ||
      !manifest.targetSchemas ||
      !manifest.legacyRelease ||
      !manifest.targetRelease ||
      units.some((unit) => !/^[a-f0-9]{64}$/.test(manifest.sourceDigests[unit]))
    )
      throw new Error("INVALID_MANIFEST");
    const existing = await this.port.read();
    if (existing) {
      if (this.hash(existing.manifest, {}) !== this.hash(manifest, {}))
        throw new Error("MIGRATION_CONFLICT");
      return existing;
    }
    const fence = await this.port.freezeAndDrain();
    if (fence.unknownDispatches !== 0) throw new Error("DISPATCH_UNCERTAIN");
    const journal: Journal = {
      manifest: structuredClone(manifest),
      revision: 0,
      epoch: fence.epoch,
      phase: "prepared",
      stores: {},
      acknowledgments: {},
    };
    await this.port.write(undefined, journal);
    return journal;
  }
  async copy(): Promise<Journal> {
    let journal = await this.required();
    if (journal.phase === "committed") return journal;
    if (journal.phase === "rolled_back") throw new Error("MIGRATION_ABANDONED");
    if (journal.phase !== "validated")
      journal = await this.save(journal, { phase: "copying" });
    for (const unit of units) {
      const source = await this.port.snapshotDigest(unit);
      if (source !== journal.manifest.sourceDigests[unit])
        throw new Error("SOURCE_CHANGED");
      const checkpoint =
        journal.stores[unit] ??
        (await this.port.copyToStaging(unit, journal.manifest));
      if (
        checkpoint.sourceDigest !== source ||
        !/^[a-f0-9]{64}$/.test(checkpoint.targetDigest) ||
        ![
          checkpoint.sourceCount,
          checkpoint.copied,
          checkpoint.quarantined,
        ].every((count) => Number.isSafeInteger(count) && count >= 0) ||
        checkpoint.copied + checkpoint.quarantined !== checkpoint.sourceCount ||
        !(await this.port.validateStaging(unit, checkpoint))
      )
        throw new Error("STAGING_INVALID");
      if (!journal.stores[unit])
        journal = await this.save(journal, {
          stores: { ...journal.stores, [unit]: checkpoint },
        });
    }
    return journal.phase === "validated"
      ? journal
      : this.save(journal, { phase: "validated" });
  }
  async acknowledge(
    owner: "extension" | "backend",
    digest: string,
    epoch: number,
  ) {
    const journal = await this.required();
    if (
      journal.phase !== "validated" ||
      journal.epoch !== epoch ||
      digest !== this.hash(journal.manifest, journal.stores)
    )
      throw new Error("STALE_ACK");
    return this.save(journal, {
      acknowledgments: { ...journal.acknowledgments, [owner]: digest },
    });
  }
  async commit() {
    const journal = await this.copy();
    if (journal.phase === "committed") return;
    const digest = this.hash(journal.manifest, journal.stores);
    if (
      journal.acknowledgments.extension !== digest ||
      journal.acknowledgments.backend !== digest
    )
      throw new Error("ACK_REQUIRED");
    await this.port.activate(journal, "target");
    await this.save(journal, { phase: "committed" });
  }
  async rollback() {
    const journal = await this.required();
    const fence = await this.port.freezeAndDrain();
    if (fence.unknownDispatches !== 0) throw new Error("DISPATCH_UNCERTAIN");
    if (!(await this.port.compatibleRelease(journal.manifest.legacyRelease)))
      throw new Error("INCOMPATIBLE_RELEASE");
    const fenced = await this.save(journal, {
      epoch: fence.epoch,
      acknowledgments: {},
    });
    await this.port.activate(fenced, "legacy");
    await this.save(fenced, { phase: "rolled_back" });
  }
  private async required() {
    const journal = await this.port.read();
    if (!journal) throw new Error("MIGRATION_MISSING");
    return journal;
  }
}
