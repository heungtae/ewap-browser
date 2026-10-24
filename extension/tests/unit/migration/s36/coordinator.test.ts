import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MigrationCoordinator,
  units,
  type Journal,
  type Manifest,
  type MigrationPort,
} from "../../../../../apps/agent-server/src/migration/coordinator.js";
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function fixture() {
  let journal: Journal | undefined;
  let pointer = "legacy";
  let unknown = 0;
  let compatible = true;
  let epoch = 0;
  let copies = 0;
  let fail = "";
  const sourceDigests = Object.fromEntries(
    units.map((unit) => [unit, digest(unit)]),
  ) as Manifest["sourceDigests"];
  const manifest: Manifest = {
    migrationId: "m36",
    sourceSchemas: "v1/v2",
    targetSchemas: "v1",
    sourceDigests,
    legacyRelease: "old",
    targetRelease: "new",
  };
  const port: MigrationPort = {
    async read() {
      return structuredClone(journal);
    },
    async write(expected, next) {
      if (journal?.revision !== expected) throw new Error("CAS");
      journal = structuredClone(next);
    },
    async freezeAndDrain() {
      return { epoch: ++epoch, unknownDispatches: unknown };
    },
    async snapshotDigest(unit) {
      return sourceDigests[unit];
    },
    async copyToStaging(unit) {
      if (fail === unit) throw new Error("QUOTA");
      copies++;
      return {
        sourceDigest: sourceDigests[unit],
        targetDigest: digest([unit]),
        copied: 2,
        quarantined: 1,
        sourceCount: 3,
      };
    },
    async validateStaging() {
      return fail !== "validate";
    },
    async activate(current, namespace) {
      if (journal?.revision !== current.revision) throw new Error("CAS");
      pointer = namespace;
    },
    async compatibleRelease() {
      return compatible;
    },
  };
  const hash = (m: Manifest, stores: Journal["stores"]) => digest([m, stores]);
  return {
    port,
    manifest,
    hash,
    coordinator: new MigrationCoordinator(port, hash),
    state: () => ({ journal, pointer, copies }),
    fail: (value: string) => {
      fail = value;
    },
    unknown: (value: number) => {
      unknown = value;
    },
    compatible: (value: boolean) => {
      compatible = value;
    },
  };
}
describe("S36 fenced migration protocol", () => {
  it("requires both matching acknowledgments before switching ownership", async () => {
    const f = fixture();
    await f.coordinator.prepare(f.manifest);
    const journal = await f.coordinator.copy();
    await expect(f.coordinator.commit()).rejects.toThrow("ACK_REQUIRED");
    const hash = f.hash(journal.manifest, journal.stores);
    await expect(
      f.coordinator.acknowledge("extension", hash, journal.epoch + 1),
    ).rejects.toThrow("STALE_ACK");
    await f.coordinator.acknowledge("extension", hash, journal.epoch);
    await expect(f.coordinator.commit()).rejects.toThrow("ACK_REQUIRED");
    await f.coordinator.acknowledge("backend", hash, journal.epoch);
    await f.coordinator.commit();
    expect(f.state().pointer).toBe("target");
    await f.coordinator.commit();
    expect(f.state().copies).toBe(6);
  });
  it("resumes after quota failure with checkpoints and preserved source", async () => {
    const f = fixture();
    await f.coordinator.prepare(f.manifest);
    f.fail("MG03");
    await expect(f.coordinator.copy()).rejects.toThrow("QUOTA");
    expect(f.state().pointer).toBe("legacy");
    f.fail("");
    await new MigrationCoordinator(f.port, f.hash).copy();
    expect(f.state().copies).toBe(6);
    expect(f.state().journal?.stores.MG03?.quarantined).toBe(1);
  });
  it("rejects changed snapshots and mismatched migrations", async () => {
    const f = fixture();
    await f.coordinator.prepare(f.manifest);
    await expect(
      f.coordinator.prepare({ ...f.manifest, migrationId: "other" }),
    ).rejects.toThrow("MIGRATION_CONFLICT");
    f.manifest.sourceDigests.MG01 = digest("changed");
    await expect(f.coordinator.copy()).rejects.toThrow("SOURCE_CHANGED");
  });
  it("holds ownership on validation failure", async () => {
    const f = fixture();
    await f.coordinator.prepare(f.manifest);
    f.fail("validate");
    await expect(f.coordinator.copy()).rejects.toThrow("STAGING_INVALID");
    expect(f.state().pointer).toBe("legacy");
  });
  it("never reconciles unknown old dispatch into a replay", async () => {
    const f = fixture();
    f.unknown(1);
    await expect(f.coordinator.prepare(f.manifest)).rejects.toThrow(
      "DISPATCH_UNCERTAIN",
    );
    expect(f.state().journal).toBeUndefined();
  });
  it("requires drained tasks and a compatible release for rollback", async () => {
    const f = fixture();
    await f.coordinator.prepare(f.manifest);
    await f.coordinator.copy();
    f.unknown(1);
    await expect(f.coordinator.rollback()).rejects.toThrow(
      "DISPATCH_UNCERTAIN",
    );
    f.unknown(0);
    f.compatible(false);
    await expect(f.coordinator.rollback()).rejects.toThrow(
      "INCOMPATIBLE_RELEASE",
    );
    f.compatible(true);
    await f.coordinator.rollback();
    expect(f.state().journal?.phase).toBe("rolled_back");
    expect(Object.keys(f.state().journal?.stores ?? {})).toHaveLength(6);
    await expect(f.coordinator.copy()).rejects.toThrow("MIGRATION_ABANDONED");
  });
});
